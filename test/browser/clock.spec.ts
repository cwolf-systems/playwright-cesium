import type { Browser, Page } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  attach,
  expect,
  InvalidOptionError,
  test,
  useVirtualClock,
  VirtualClockRequiredError,
} from '../../src/index.js';
import { openDemo, SETTLE_TIMEOUT_MS } from './demo.js';

const START = '2026-06-21T14:00:00Z';
const REAL_WAIT_MS = 600;

interface CountingWindow {
  viewer: { scene: { postRender: { addEventListener(listener: () => void): void } } };
  playwrightFrames?: number;
}

/** Counts the frames Cesium renders from now on. */
const countFrames = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const win = window as unknown as CountingWindow;
    win.playwrightFrames = 0;
    win.viewer.scene.postRender.addEventListener(() => {
      win.playwrightFrames = (win.playwrightFrames ?? 0) + 1;
    });
  });

const framesCounted = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as CountingWindow).playwrightFrames ?? 0);

interface AnimatingWindow {
  playwrightTimestamps: number[];
}

test('time stands still until a frame is stepped', async ({ page, cesium }) => {
  await cesium.useVirtualClock({ start: START });
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  expect(scene.info.virtualClock).toBe(true);

  const read = () => page.evaluate(() => ({ date: Date.now(), perf: performance.now() }));
  const before = await read();
  expect(before.date).toBe(Date.parse(START));
  await delay(REAL_WAIT_MS);
  expect(await read()).toEqual(before);

  await scene.step(3);
  const after = await read();
  expect(after.date - before.date).toBeCloseTo(50, 6);
  expect(after.perf - before.perf).toBeCloseTo(50, 6);
});

test('Cesium renders nothing on its own, and exactly the frames stepped', async ({
  page,
  cesium,
}) => {
  await cesium.useVirtualClock();
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await countFrames(page);
  await delay(REAL_WAIT_MS);
  expect(await framesCounted(page)).toBe(0);
  await scene.step(5);
  expect(await framesCounted(page)).toBe(5);
});

test('animation frames run only when a frame is stepped, at virtual time', async ({
  page,
  cesium,
}) => {
  await cesium.useVirtualClock();
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  const started = await page.evaluate(() => {
    const win = window as unknown as AnimatingWindow;
    win.playwrightTimestamps = [];
    const onFrame = (timestamp: number): void => {
      win.playwrightTimestamps.push(timestamp);
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
    return performance.now();
  });
  const timestamps = (): Promise<number[]> =>
    page.evaluate(() => (window as unknown as AnimatingWindow).playwrightTimestamps);

  await delay(REAL_WAIT_MS);
  expect(await timestamps()).toEqual([]);
  await scene.step(2);
  const [first, second] = await timestamps();
  expect(await timestamps()).toHaveLength(2);
  expect((first ?? 0) - started).toBeCloseTo(1000 / 60, 6);
  expect((second ?? 0) - started).toBeCloseTo(2000 / 60, 6);
});

test('settles under the virtual clock, stepping frames itself', async ({ page, cesium }) => {
  await cesium.useVirtualClock();
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  const report = await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  expect(report.frames).toBeGreaterThanOrEqual(10);
});

test('refuses to step without the virtual clock, or by a count that is not whole', async ({
  page,
  cesium,
  browser,
}) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  expect(scene.info.virtualClock).toBe(false);
  await expect(scene.step()).rejects.toThrow(VirtualClockRequiredError);

  const clockedPage = await browser.newPage();
  await useVirtualClock(clockedPage);
  await openDemo(clockedPage);
  const clocked = await attach(clockedPage, 'window.viewer');
  await expect(clocked.step(0)).rejects.toThrow(InvalidOptionError);
  await expect(clocked.step(1.5)).rejects.toThrow(InvalidOptionError);
  await clockedPage.close();
});

/** The first values `Math.random` gives a fresh page under the virtual clock. */
async function firstRandoms(browser: Browser, seed: number): Promise<number[]> {
  const page = await browser.newPage();
  try {
    await useVirtualClock(page, { seed });
    await page.goto('/blank.html');
    return await page.evaluate(() => [Math.random(), Math.random(), Math.random()]);
  } finally {
    await page.close();
  }
}

test('Math.random gives the same values for the same seed, and others for another', async ({
  browser,
}) => {
  const seven = await firstRandoms(browser, 7);
  expect(await firstRandoms(browser, 7)).toEqual(seven);
  expect(await firstRandoms(browser, 8)).not.toEqual(seven);
  for (const value of seven) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
});
