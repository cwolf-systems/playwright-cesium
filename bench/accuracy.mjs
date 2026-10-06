// Does each way of waiting for a CesiumJS scene say "done" when the scene is done? Run with
// `npm run bench:accuracy`; it builds first. Results: docs/benchmarks/accuracy.md.
//
// Each method opens the demo scene in a fresh page, waits its way, and screenshots. A capture is
// premature when it differs visibly from a reference of the finished scene (judged by
// playwright-perceptual). The reference does not rely on settled(): it is taken after 60 frames
// with nothing loading and must then match a second screenshot taken two seconds later.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { platform, arch } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { compareImages, decodePng } from '@cwolf-systems/playwright-perceptual';
import { attach, useVirtualClock } from '../dist/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4185;
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 640, height: 360 };
const RUNS = 3;
const WAIT_LIMIT_MS = 60_000;
const IMAGERY = '**/NaturalEarthII/**';
const BLOCK_TILES = '**/tiles/block-*.glb';

/** The reference: settled for a long run of frames, then unchanged two seconds later. */
const REFERENCE = { frames: 60, recheckMs: 2_000 };

/** Re:Earth's method: screenshots this far apart until this many in a row are identical. */
const IDENTICAL = { intervalMs: 1_000, inARow: 3 };

/** Held-back tiles wait between these, fixed per tile so every run sees the same. */
const HELD_BACK_MS = { min: 1_000, spread: 2_000 };

/** How much slower Chromium's DevTools throttling makes the CPU. */
const CPU_SLOWDOWN = 4;

const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Holds back each request matching `pattern` by a fixed time between 1 and 3 seconds. */
const holdBack = (pattern) => (page) =>
  page.route(pattern, async (route) => {
    const url = route.request().url();
    await delay(HELD_BACK_MS.min + (Math.abs(hash(url)) % HELD_BACK_MS.spread));
    await route.continue();
  });

const SCENARIOS = {
  demo: { query: '' },
  'imagery 1–3 s late': { query: '', prepare: holdBack(IMAGERY) },
  '3D Tiles': { query: '?tiles' },
  '3D tiles 1–3 s late': { query: '?tiles', prepare: holdBack(BLOCK_TILES) },
  'request-render mode': { query: '?requestRender' },
  'CPU 4× slower': {
    query: '',
    browsers: ['chromium'],
    prepare: async (page) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
    },
  },
};

const screenshot = (page) => page.screenshot({ animations: 'disabled', caret: 'hide' });

/** Each way of waiting: opens the scene its own way and returns the screenshot it would take. */
const METHODS = {
  'settled()': async (page, query) => {
    await page.goto(`${BASE}/${query}`);
    const scene = await attach(page, 'window.viewer');
    await scene.settled({ timeout: WAIT_LIMIT_MS });
    return screenshot(page);
  },
  'settled(), virtual clock': async (page, query) => {
    await useVirtualClock(page);
    await page.goto(`${BASE}/${query}`);
    const scene = await attach(page, 'window.viewer');
    await scene.settled({ timeout: WAIT_LIMIT_MS });
    return screenshot(page);
  },
  networkidle: async (page, query) => {
    await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle', timeout: WAIT_LIMIT_MS });
    return screenshot(page);
  },
  'sleep 1 s': (page, query) => sleepThen(page, query, 1_000),
  'sleep 3 s': (page, query) => sleepThen(page, query, 3_000),
  'sleep 5 s': (page, query) => sleepThen(page, query, 5_000),
  'load event': async (page, query) => {
    await page.goto(`${BASE}/${query}`);
    return screenshot(page);
  },
  '3 identical screenshots': async (page, query) => {
    await page.goto(`${BASE}/${query}`);
    const started = Date.now();
    let previous = await screenshot(page);
    for (let same = 1; same < IDENTICAL.inARow;) {
      if (Date.now() - started > WAIT_LIMIT_MS) throw new Error('timed out');
      await delay(IDENTICAL.intervalMs);
      const next = await screenshot(page);
      same = next.equals(previous) ? same + 1 : 1;
      previous = next;
    }
    return previous;
  },
};

async function sleepThen(page, query, ms) {
  await page.goto(`${BASE}/${query}`);
  await delay(ms);
  return screenshot(page);
}

async function withPage(type, scenario, run) {
  const browser = await type.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await scenario.prepare?.(page);
    return await run(page);
  } finally {
    await browser.close();
  }
}

/** The finished scene, by a stricter wait than any method under test. */
function reference(type, scenario) {
  return withPage(type, scenario, async (page) => {
    await page.goto(`${BASE}/${scenario.query}`);
    const scene = await attach(page, 'window.viewer');
    await scene.settled({ frames: REFERENCE.frames, timeout: WAIT_LIMIT_MS * 2 });
    const first = await screenshot(page);
    await delay(REFERENCE.recheckMs);
    const second = await screenshot(page);
    const drift = compareImages(decodePng(first), decodePng(second)).differing;
    if (drift > 0) throw new Error(`the reference kept changing (${drift} pixels)`);
    return decodePng(second);
  });
}

async function measure(type, scenario, expected, method) {
  const started = Date.now();
  try {
    const png = await withPage(type, scenario, (page) => METHODS[method](page, scenario.query));
    const differing = compareImages(expected, decodePng(png)).differing;
    return { ms: Date.now() - started, premature: differing > 0, differing };
  } catch (error) {
    return { ms: Date.now() - started, failed: String(error).split('\n')[0] };
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const server = spawn(process.execPath, [join(ROOT, 'demo', 'server.mjs'), String(PORT)], {
  stdio: 'ignore',
});
const results = [];
try {
  await delay(500);
  for (const [browserName, type] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    for (const [scenarioName, scenario] of Object.entries(SCENARIOS)) {
      if (scenario.browsers && !scenario.browsers.includes(browserName)) continue;
      console.log(`${browserName}, ${scenarioName}: reference`);
      const expected = await reference(type, scenario);
      for (const method of Object.keys(METHODS)) {
        const runs = [];
        for (let run = 0; run < RUNS; run++)
          runs.push(await measure(type, scenario, expected, method));
        results.push({ browser: browserName, scenario: scenarioName, method, runs });
        const premature = runs.filter((r) => r.premature).length;
        const failed = runs.filter((r) => r.failed).length;
        console.log(
          `  ${method}: ${premature}/${RUNS} premature, ${failed} failed, median ${median(runs.map((r) => r.ms))} ms`,
        );
      }
    }
  }
} finally {
  server.kill();
}

const outputDir = join(ROOT, 'bench', 'results');
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  join(outputDir, `accuracy-${platform()}-${arch()}.json`),
  JSON.stringify(results, null, 2),
);
