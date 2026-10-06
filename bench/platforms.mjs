// What each browser on this machine can do for CesiumJS: raw WebGL support, whether Cesium starts
// (as it chooses, and asked for WebGL 1), Cesium's feature flags, and how long the demo scene takes
// to settle, as the median of a few loads, each in a fresh context, with their range. Writes
// bench/results/platforms/<platform>.json and .md; in GitHub Actions, also the job summary. It records; it never fails on what a browser lacks. Published results:
// docs/benchmarks/platforms.md.
//   npm run bench:platforms

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(ROOT, 'bench', 'results', 'platforms');
const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 640, height: 360 };
const NAVIGATION_TIMEOUT = 60_000;
const START_TIMEOUT = 30_000;
const SETTLE_TIMEOUT = 120_000;
const PLATFORM = `${process.platform}-${process.arch}`;
/** Loads of the scene per browser: shared CI runners vary a lot from one load to the next. */
const SAMPLES = 3;

const CONFIGS = [
  // Playwright's headless mode runs chromium-headless-shell, a separate binary.
  { name: 'chromium', type: chromium, options: {} },
  { name: 'chromium (full)', type: chromium, options: { channel: 'chromium' } },
  { name: 'chromium, SwiftShader', type: chromium, options: { args: ['--use-angle=swiftshader'] } },
  { name: 'firefox', type: firefox, options: {} },
  {
    name: 'firefox, WebGL forced',
    type: firefox,
    options: { firefoxUserPrefs: { 'webgl.force-enabled': true } },
  },
  { name: 'webkit', type: webkit, options: {} },
];

/** Runs in the page: what plain WebGL offers, before Cesium is involved. */
function webglCapabilities() {
  const probe = (type) => {
    const gl = document.createElement('canvas').getContext(type);
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      extensions: gl.getSupportedExtensions() ?? [],
    };
  };
  return { webgl2: probe('webgl2'), webgl1: probe('webgl') };
}

/** Runs in the page once the scene has started: Cesium's view of the context. */
function cesiumFlags() {
  const { scene } = window.viewer;
  return {
    version: window.Cesium.VERSION,
    webgl2: scene.context.webgl2,
    msaa: scene.msaaSupported,
    hdr: scene.highDynamicRangeSupported,
    depthPicking: scene.pickPositionSupported,
    logarithmicDepth: scene.logarithmicDepthBuffer,
  };
}

/** Opens the demo scene and reports whether Cesium started and how long it took to settle. */
async function startScene(page, query) {
  const started = Date.now();
  try {
    await page.goto(`${BASE}/${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT,
    });
  } catch (error) {
    return { started: false, error: `page did not load: ${String(error).split('\n')[0]}` };
  }
  const body = page.locator('body');
  try {
    await page
      .locator('body[data-webgl], body[data-unsupported], body[data-error]')
      .waitFor({ state: 'attached', timeout: START_TIMEOUT });
  } catch {
    return { started: false, error: 'no response from the scene' };
  }
  if ((await body.getAttribute('data-webgl')) !== 'available') {
    const reason =
      (await body.getAttribute('data-unsupported')) ?? (await body.getAttribute('data-error'));
    return { started: false, error: reason };
  }
  try {
    // A render error stops Cesium's loop for good, so it ends the wait as surely as settling.
    await page
      .locator('body[data-ready], body[data-error]')
      .waitFor({ state: 'attached', timeout: SETTLE_TIMEOUT });
    if ((await body.getAttribute('data-ready')) === null) throw new Error('render error');
  } catch {
    return {
      started: true,
      settled: false,
      error: await body.getAttribute('data-error'),
      flags: await page.evaluate(cesiumFlags),
    };
  }
  return {
    started: true,
    settled: true,
    settleMs: Date.now() - started,
    flags: await page.evaluate(cesiumFlags),
  };
}

async function probe({ name, type, options }) {
  let browser;
  try {
    browser = await type.launch(options);
  } catch (error) {
    return { name, launched: false, error: String(error).split('\n')[0] };
  }
  // Each load in a fresh context of the same browser, as a test suite runs its tests.
  const inFreshPage = async (run) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    try {
      return await run(await context.newPage());
    } finally {
      await context.close();
    }
  };
  try {
    const webgl = await inFreshPage(async (page) => {
      await page.goto(`${BASE}/blank.html`, { timeout: NAVIGATION_TIMEOUT });
      return page.evaluate(webglCapabilities);
    });
    const loads = [];
    for (let sample = 0; sample < SAMPLES; sample++) {
      const load = await inFreshPage((page) => startScene(page, ''));
      loads.push(load);
      if (!load.settled) break;
    }
    return {
      name,
      launched: true,
      version: browser.version(),
      webgl,
      cesium: loads.at(-1),
      settleMs: loads.every((load) => load.settled) ? loads.map((load) => load.settleMs) : null,
      cesiumWebgl1: await inFreshPage((page) => startScene(page, '?webgl1')),
    };
  } catch (error) {
    return { name, launched: false, error: String(error).split('\n')[0] };
  } finally {
    await browser.close();
  }
}

const firstLine = (text) => text.split('\n')[0].replaceAll('|', '/');

const yesNo = (value) => (value === undefined || value === null ? '–' : value ? 'yes' : 'no');

const seconds = (ms) => (ms / 1000).toFixed(1);

function cesiumCell(run, settleMs = [run.settleMs]) {
  if (!run.started) return `no (${firstLine(run.error ?? 'unknown')})`;
  if (!run.settled) return `started, never settled${run.error ? ` (${firstLine(run.error)})` : ''}`;
  if (settleMs.length === 1) return `yes, ${seconds(settleMs[0])} s`;
  const sorted = [...settleMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return `yes, ${seconds(median)} s (${seconds(sorted[0])}–${seconds(sorted.at(-1))})`;
}

function table(results) {
  const header =
    '| Browser | Version | WebGL 2 | WebGL 1 | Renderer | Cesium | Cesium, WebGL 1 | Context | MSAA | HDR | Depth picking |';
  const rows = results.map((r) => {
    if (!r.launched)
      return `| ${r.name} | – | – | – | – | did not launch: ${r.error} | – | – | – | – | – |`;
    const flags = r.cesium.flags ?? r.cesiumWebgl1.flags ?? {};
    const context = flags.webgl2 === undefined ? '–' : flags.webgl2 ? 'WebGL 2' : 'WebGL 1';
    const renderer = r.webgl.webgl2?.renderer ?? r.webgl.webgl1?.renderer ?? '–';
    return [
      r.name,
      r.version,
      yesNo(r.webgl.webgl2),
      yesNo(r.webgl.webgl1),
      renderer.replaceAll('|', '/'),
      cesiumCell(r.cesium, r.settleMs ?? undefined),
      cesiumCell(r.cesiumWebgl1),
      context,
      yesNo(flags.msaa),
      yesNo(flags.hdr),
      yesNo(flags.depthPicking),
    ]
      .join(' | ')
      .replace(/^/, '| ')
      .concat(' |');
  });
  return [header, `|${'---|'.repeat(11)}`, ...rows].join('\n');
}

const server = spawn(process.execPath, [join(ROOT, 'demo', 'server.mjs'), String(PORT)], {
  stdio: 'ignore',
});
try {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const results = [];
  for (const config of CONFIGS) {
    console.log(`probing ${config.name}`);
    results.push(await probe(config));
  }
  const markdown = `### ${PLATFORM}\n\n${table(results)}\n`;
  mkdirSync(OUTPUT, { recursive: true });
  writeFileSync(join(OUTPUT, `${PLATFORM}.json`), JSON.stringify(results, null, 2));
  writeFileSync(join(OUTPUT, `${PLATFORM}.md`), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`\n${markdown}`);
} finally {
  server.kill();
}
