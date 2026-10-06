import { compareImages, decodePng } from '@cwolf-systems/playwright-perceptual';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test, type RgbaImage } from '../../src/index.js';
import { openDemo, SETTLE_TIMEOUT_MS } from './demo.js';

/** What page code sees of the demo's Cesium, for reading results back. */
interface DemoGlobals {
  Cesium: { JulianDate: { toIso8601(date: unknown): string } };
  viewer: {
    clock: { currentTime: unknown };
    camera: {
      heading: number;
      pitch: number;
      positionCartographic: { longitude: number; latitude: number; height: number };
    };
  };
}

const NIGHT = '2026-06-21T04:00:00Z';
const LOCAL_NOON = '2026-06-21T18:00:00Z';
const PLACE = { lon: -116.2, lat: 43.4 };

const brightness = ({ data }: RgbaImage): number => {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4)
    sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
  return sum / (data.length / 4) / 3;
};

test('freezes the clock at an instant, which then holds still', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  expect(await scene.freeze(NIGHT)).toMatch(/^2026-06-21T04:00:00(\.0+)?Z$/);
  await delay(1_000);
  const now = await page.evaluate(() => {
    const { Cesium, viewer } = window as unknown as DemoGlobals;
    return Cesium.JulianDate.toIso8601(viewer.clock.currentTime);
  });
  expect(now).toMatch(/^2026-06-21T04:00:00(\.0+)?Z$/);
});

// Cesium fades the globe's sun lighting out as the camera comes close, so the difference shows
// from far away.
test('freezing at night darkens the lit globe', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.setView({ ...PLACE, height: 15_000_000 });
  await scene.freeze(LOCAL_NOON);
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  const day = brightness(await scene.pixels());
  await scene.freeze(NIGHT);
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  const night = brightness(await scene.pixels());
  expect(night).toBeLessThan(day * 0.8);
});

test('puts the camera exactly where it is told', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.setView({ ...PLACE, height: 12_000, heading: 30, pitch: -45 });
  const camera = await page.evaluate(() => {
    const { heading, pitch, positionCartographic } = (window as unknown as DemoGlobals).viewer
      .camera;
    return { heading, pitch, ...positionCartographic };
  });
  const degrees = (radians: number): number => (radians * 180) / Math.PI;
  expect(degrees(camera.longitude)).toBeCloseTo(PLACE.lon, 6);
  expect(degrees(camera.latitude)).toBeCloseTo(PLACE.lat, 6);
  expect(camera.height).toBeCloseTo(12_000, 2);
  expect(degrees(camera.heading)).toBeCloseTo(30, 6);
  expect(degrees(camera.pitch)).toBeCloseTo(-45, 6);
});

test('projects the point under a straight-down camera to the canvas centre', async ({
  page,
  cesium,
}) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.setView({ ...PLACE, height: 20_000 });
  const centre = await scene.project(PLACE);
  const box = await scene.canvas.boundingBox();
  expect(centre).not.toBeNull();
  expect(box).not.toBeNull();
  expect(centre?.x).toBeCloseTo((box?.width ?? 0) / 2, 0);
  expect(centre?.y).toBeCloseTo((box?.height ?? 0) / 2, 0);
});

test('projects nothing for points behind the globe or off the canvas', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.setView({ ...PLACE, height: 20_000 });
  expect(await scene.project({ lon: PLACE.lon + 180, lat: -PLACE.lat })).toBeNull();
  expect(await scene.project({ lon: PLACE.lon + 3, lat: PLACE.lat })).toBeNull();
});

/** What page code sees of the demo's Cesium, for looking at a place through a transform. */
interface TransformGlobals {
  Cesium: {
    Cartesian3: { fromDegrees(lon: number, lat: number, height: number): unknown };
    Transforms: { eastNorthUpToFixedFrame(origin: unknown): unknown };
    HeadingPitchRange: new (heading: number, pitch: number, range: number) => unknown;
  };
  viewer: { camera: { lookAtTransform(transform: unknown, offset: unknown): void } };
}

test('projects through a camera transform, as lookAt and tracked entities set', async ({
  page,
  cesium,
}) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  const target = { ...PLACE, height: 1_000 };
  await page.evaluate((place) => {
    const { Cesium, viewer } = window as unknown as TransformGlobals;
    const centre = Cesium.Cartesian3.fromDegrees(place.lon, place.lat, place.height);
    viewer.camera.lookAtTransform(
      Cesium.Transforms.eastNorthUpToFixedFrame(centre),
      new Cesium.HeadingPitchRange(0, -0.6, 20_000),
    );
  }, target);
  const point = await scene.project(target);
  expect(point?.x).toBeCloseTo(320, 3);
  expect(point?.y).toBeCloseTo(180, 3);
});

test('reads the pixels a screenshot of the canvas shows', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
  const box = await scene.canvas.boundingBox();
  if (!box) throw new Error('the canvas has no box');

  const whole = await scene.pixels();
  expect([whole.width, whole.height]).toEqual([Math.round(box.width), Math.round(box.height)]);

  // The top of the canvas, clear of the credits Cesium overlays at the bottom.
  const region = { x: 0, y: 0, width: Math.round(box.width), height: 120 };
  const read = await scene.pixels(region);
  expect([read.width, read.height]).toEqual([region.width, region.height]);
  const shot = decodePng(await page.screenshot({ clip: { ...region, x: box.x, y: box.y } }));
  expect(compareImages(shot, read).differing).toBe(0);
});

test('says so when a region lies outside the canvas', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  await expect(scene.pixels({ x: 5_000, y: 0, width: 10, height: 10 })).rejects.toThrow(
    /the region lies outside the \d+×\d+ canvas/,
  );
});
