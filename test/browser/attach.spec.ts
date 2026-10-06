import { expect, NotAViewerError, test } from '../../src/index.js';
import { openDemo, SETTLE_TIMEOUT_MS } from './demo.js';

test('attaches to a Viewer and reads the Cesium version', async ({ page, cesium }) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer');
  expect(scene.info.widget).toBe('Viewer');
  expect(scene.info.version).toMatch(/^1\.\d+/);
});

test('leaves the version out when the namespace expression is not Cesium', async ({
  page,
  cesium,
}) => {
  await openDemo(page);
  const scene = await cesium.attach('window.viewer', { cesium: 'window.document' });
  expect(scene.info.version).toBeNull();
  await scene.settled({ timeout: SETTLE_TIMEOUT_MS });
});

test('refuses anything that is not a Viewer or CesiumWidget', async ({ page, cesium }) => {
  await openDemo(page);
  await expect(cesium.attach('window.document')).rejects.toThrow(NotAViewerError);
  await expect(cesium.attach('window.document')).rejects.toThrow(/evaluated to a HTMLDocument$/);
  await expect(cesium.attach('window.notThere')).rejects.toThrow(/evaluated to undefined$/);
  await expect(cesium.attach('window.notThere.either')).rejects.toThrow(/evaluated to an error: /);
});
