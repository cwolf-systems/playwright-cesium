import { expect, test, type Page } from '@playwright/test';

/** The demo viewer, as page code sees it. */
export interface DemoWindow {
  viewer: {
    scene: {
      globe: { tilesLoaded: boolean };
      primitives: { add(primitive: object): unknown };
    };
  };
  /** The 3D Tiles block, in the `?tiles` scene once its tileset.json has loaded. */
  tileset?: {
    tilesLoaded: boolean;
    statistics: { numberOfLoadedTilesTotal: number };
  };
}

/** Opens the demo scene, skipping where CesiumJS cannot start in this browser. */
export async function openDemo(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  const body = page.locator('body');
  await page
    .locator('body[data-webgl], body[data-unsupported], body[data-error]')
    .waitFor({ state: 'attached' });
  const unsupported = await body.getAttribute('data-unsupported');
  test.skip(unsupported !== null, `CesiumJS cannot start in this browser here: ${unsupported}`);
  expect(await body.getAttribute('data-error')).toBeNull();
}

/**
 * How long the tests let a scene settle: under software rendering on CI a scene can take longer
 * than the 30 s default (docs/benchmarks/platforms.md).
 */
export const SETTLE_TIMEOUT_MS = 120_000;

/** Imagery tiles from the bundled Natural Earth II set. */
export const IMAGERY = '**/NaturalEarthII/**';

/** The `?tiles` block's child tiles; its root and tileset.json load first. */
export const BLOCK_TILES = '**/tiles/block-*.glb';
