import type { Route } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, NotSettledError, RenderError, test } from '../../src/index.js';
import { IMAGERY, openDemo, type DemoWindow, SETTLE_TIMEOUT_MS } from './demo.js';

const HELD_BACK_MS = 3_000;

const globeLoaded = (): boolean => (window as unknown as DemoWindow).viewer.scene.globe.tilesLoaded;

test('settles the demo scene, with the globe loaded', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  const report = await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(report.frames).toBeGreaterThanOrEqual(10);
  expect(await page.evaluate(globeLoaded)).toBe(true);
});

test('settles a scene in request-render mode, which renders only when asked', async ({
  page,
  cesium,
}) => {
  await openDemo(page, '?requestRender');
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(await page.evaluate(globeLoaded)).toBe(true);
});

// Held-back tiles show both as globe tiles loading and as requests in flight. Each test also runs
// without the namespace, so the requests go unseen and the globe's own state must hold it back.
for (const [label, options] of [
  ['', {}],
  [', seen only through the globe', { cesium: 'window.document' }],
] as const) {
  test(`waits for imagery tiles that arrive late${label}`, async ({ page, cesium }) => {
    await page.route(IMAGERY, async (route) => {
      await delay(HELD_BACK_MS);
      await route.continue();
    });
    await openDemo(page);
    const scene = await cesium.attach('window.viewer', options);
    const report = await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
    expect(report.elapsedMs).toBeGreaterThan(HELD_BACK_MS / 2);
    expect(await page.evaluate(globeLoaded)).toBe(true);
  });

  test(`says what is still loading when the time runs out${label}`, async ({ page, cesium }) => {
    const held: Route[] = [];
    await page.route(IMAGERY, (route) => {
      held.push(route);
    });
    await openDemo(page);
    const scene = await cesium.attach('window.viewer', options);
    const settled = scene.settled({ timeout: 1_500 });
    await expect(settled).rejects.toThrow(NotSettledError);
    await expect(settled).rejects.toThrow(/Still pending: globe tiles loading/);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
}

test('fails at once, with Cesium’s message, when rendering stops', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await page.evaluate(() => {
    (window as unknown as DemoWindow).viewer.scene.primitives.add({
      update() {
        throw new Error('a broken primitive');
      },
      isDestroyed: () => false,
      destroy() {},
    });
  });
  const started = Date.now();
  await expect(scene.settled()).rejects.toThrow(RenderError);
  await expect(scene.settled()).rejects.toThrow('Cesium stopped rendering: a broken primitive');
  expect(Date.now() - started).toBeLessThan(5_000);
});

/** What page code sees of the demo, for the loading cases below. */
interface LoadingGlobals {
  Cesium: { Cartesian3: { fromDegrees(lon: number, lat: number, height: number): unknown } };
  viewer: {
    camera: { flyTo(options: { destination: unknown; duration: number }): void };
    scene: { tweens: { length: number }; globe: { terrainProvider: unknown } };
  };
}

const FLIGHT_SECONDS = 3;

test('waits for a camera flight to finish', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  await page.evaluate((duration) => {
    const { Cesium, viewer } = window as unknown as LoadingGlobals;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-116.1, 43.3, 40_000),
      duration,
    });
  }, FLIGHT_SECONDS);
  const report = await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(report.elapsedMs).toBeGreaterThan(FLIGHT_SECONDS * 1_000);
  expect(
    await page.evaluate(() => (window as unknown as LoadingGlobals).viewer.scene.tweens.length),
  ).toBe(0);
});

test('waits for terrain the scene is still creating, without the namespace', async ({
  page,
  cesium,
}) => {
  await openDemo(page, `?terrainAfter=${HELD_BACK_MS}`);
  const scene = await cesium.attach('window.viewer', { cesium: 'window.document' });
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(
    await page.evaluate(
      () => (window as unknown as LoadingGlobals).viewer.scene.globe.terrainProvider !== undefined,
    ),
  ).toBe(true);
});

test('waits for a model’s textures, without the namespace', async ({ page, cesium }) => {
  await page.route('**/marker.png', async (route) => {
    await delay(HELD_BACK_MS);
    await route.continue();
  });
  await openDemo(page, '?model');
  const scene = await cesium.attach('window.viewer', { cesium: 'window.document' });
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(await page.locator('body').getAttribute('data-marker-textures')).toBe('loaded');
});

interface BillboardWindow {
  viewer: { scene: { globe: { tilesLoaded: boolean } } };
  billboards: { get(index: number): { ready: boolean } };
}

// The demo's billboards: one with marker.png, one with no image and one whose image fails, which
// must not hold the scene back.
test('waits for a billboard image held back past the rest of the scene, without the namespace', async ({
  page,
  cesium,
}) => {
  const held: Route[] = [];
  let released = false;
  await page.route('**/marker.png', async (route) => {
    if (released) await route.continue();
    else held.push(route);
  });
  await openDemo(page, '?billboards');
  const scene = await cesium.attach('window.viewer', { cesium: 'window.document' });
  const settledAt = scene.settled({ timeout: SETTLE_TIMEOUT_MS }).then(() => Date.now());
  await page.waitForFunction(
    () => (window as unknown as BillboardWindow).viewer.scene.globe.tilesLoaded,
  );
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await delay(HELD_BACK_MS);

  const releasedAt = Date.now();
  released = true;
  await Promise.all(held.map((route) => route.continue()));
  expect(await settledAt).toBeGreaterThan(releasedAt);
  expect(
    await page.evaluate(() => (window as unknown as BillboardWindow).billboards.get(0).ready),
  ).toBe(true);
});
