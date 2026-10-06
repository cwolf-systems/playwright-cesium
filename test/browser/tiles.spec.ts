import type { Route } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, NotSettledError, test } from '../../src/index.js';
import { BLOCK_TILES, openDemo, type DemoWindow, SETTLE_TIMEOUT_MS } from './demo.js';

const HELD_BACK_MS = 3_000;
/** The block's root and its four children. */
const BLOCK_TILE_COUNT = 5;

const tilesLoaded = (): number | null => {
  const { tileset } = window as unknown as DemoWindow;
  return tileset?.tilesLoaded ? tileset.statistics.numberOfLoadedTilesTotal : null;
};

test('settles a 3D Tiles scene with the root and all four children loaded', async ({
  page,
  cesium,
}) => {
  await openDemo(page, '?tiles');
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(await page.evaluate(tilesLoaded)).toBe(BLOCK_TILE_COUNT);
});

test('waits for a tileset.json that arrives late, seen as a request in flight', async ({
  page,
  cesium,
}) => {
  await page.route('**/tiles/tileset.json', async (route) => {
    await delay(HELD_BACK_MS);
    await route.continue();
  });
  await openDemo(page, '?tiles');
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(await page.evaluate(tilesLoaded)).toBe(BLOCK_TILE_COUNT);
});

// As with globe tiles, each test also runs without the namespace, so the requests go unseen and
// the tileset's own state must hold it back.
for (const [label, options] of [
  ['', {}],
  [', seen only through the tileset', { cesium: 'window.document' }],
] as const) {
  test(`waits for 3D tiles held back past the rest of the scene${label}`, async ({
    page,
    cesium,
  }) => {
    const held: Route[] = [];
    let released = false;
    await page.route(BLOCK_TILES, async (route) => {
      if (released) await route.continue();
      else held.push(route);
    });
    await openDemo(page, '?tiles');
    const scene = await cesium.attach('window.viewer', options);
    const settledAt = scene.settled({ timeout: SETTLE_TIMEOUT_MS }).then(() => Date.now());
    await page.waitForFunction(
      () => (window as unknown as DemoWindow).viewer.scene.globe.tilesLoaded,
    );
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await delay(HELD_BACK_MS);

    const releasedAt = Date.now();
    released = true;
    await Promise.all(held.map((route) => route.continue()));
    expect(await settledAt).toBeGreaterThan(releasedAt);
    expect(await page.evaluate(tilesLoaded)).toBe(BLOCK_TILE_COUNT);
  });

  test(`says a tileset is still loading when the time runs out${label}`, async ({
    page,
    cesium,
  }) => {
    const held: Route[] = [];
    await page.route(BLOCK_TILES, (route) => {
      held.push(route);
    });
    await openDemo(page, '?tiles');
    await page.waitForFunction(() => (window as unknown as DemoWindow).tileset !== undefined);
    const scene = await cesium.attach('window.viewer', options);
    const settled = scene.settled({ timeout: 3_000 });
    await expect(settled).rejects.toThrow(NotSettledError);
    await expect(settled).rejects.toThrow(/1 3D Tiles tileset loading/);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
}

test('loads every tile under the virtual frame clock', async ({ page, cesium }) => {
  await cesium.useVirtualClock();
  await openDemo(page, '?tiles');
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(await page.evaluate(tilesLoaded)).toBe(BLOCK_TILE_COUNT);
});
