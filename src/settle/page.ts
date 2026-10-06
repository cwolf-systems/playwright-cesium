import type { CesiumNamespaceLike, PrimitiveCollectionLike, WidgetLike } from '../cesium.js';
import type { Watch } from '../attach/types.js';
import type { VirtualClock } from '../clock/types.js';
import type { Check } from './types.js';

export interface CheckArgs {
  readonly widget: WidgetLike;
  readonly watched: Watch;
  readonly namespace: CesiumNamespaceLike | undefined;
  /** Render a frame first, for when Cesium is rendering none on its own. */
  readonly render: boolean;
}

/** Reports what is still loading and how many frames Cesium has rendered, or its render error. */
export function check({ widget, watched, namespace, render }: CheckArgs): Check {
  const failed = (): Check | null =>
    watched.errors.length > 0 ? { kind: 'render-error', message: watched.errors[0] ?? '' } : null;

  const earlier = failed();
  if (earlier) return earlier;
  if (render) {
    // Under the virtual frame clock, a frame first moves time on by one frame.
    const clock = (globalThis as { __playwrightCesiumClock?: VirtualClock })
      .__playwrightCesiumClock;
    clock?.advance(clock.frameMs);
    // Request it: in request-render mode Cesium draws nothing unasked.
    widget.scene.requestRender();
    widget.render();
  }
  const now = failed();
  if (now) return now;

  let tilesetsLoading = 0;
  let primitivesPending = 0;
  let modelTexturesLoading = 0;
  let billboardImagesLoading = 0;
  const hasItems = (value: object): value is PrimitiveCollectionLike =>
    typeof (value as Partial<PrimitiveCollectionLike>).get === 'function' &&
    typeof (value as Partial<PrimitiveCollectionLike>).length === 'number';
  // A collection of primitives, as opposed to billboard, label and point collections.
  const isCollection = (value: object): value is PrimitiveCollectionLike =>
    hasItems(value) &&
    typeof (value as { destroyPrimitives?: unknown }).destroyPrimitives === 'boolean';
  // A billboard collection's own `ready` stays false while any billboard has no image, a failed
  // one included, so each billboard is looked at instead: loading means an image set, not ready.
  const countImagesLoading = (items: PrimitiveCollectionLike): void => {
    for (let index = 0; index < items.length; index++) {
      const item = items.get(index) as { show?: unknown; image?: unknown; ready?: unknown };
      if (index === 0 && !('image' in item)) return;
      if (item.show !== false && item.image !== undefined && item.ready === false) {
        billboardImagesLoading++;
      }
    }
  };
  const visit = (collection: PrimitiveCollectionLike): void => {
    for (let index = 0; index < collection.length; index++) {
      const primitive = collection.get(index);
      if (typeof primitive !== 'object' || primitive === null) continue;
      if (isCollection(primitive)) {
        visit(primitive);
        continue;
      }
      if (hasItems(primitive)) {
        countImagesLoading(primitive);
        continue;
      }
      const state = primitive as {
        tilesLoaded?: unknown;
        ready?: unknown;
        incrementallyLoadTextures?: unknown;
        _texturesLoaded?: unknown;
      };
      if (state.tilesLoaded === false) tilesetsLoading++;
      if (state.ready === false) primitivesPending++;
      // A glTF model draws before its textures arrive. Cesium keeps whether they have only in a
      // private field; if that changes, models count as loaded once ready, as before.
      else if (state.incrementallyLoadTextures === true && state._texturesLoaded === false) {
        modelTexturesLoading++;
      }
    }
  };
  const { scene } = widget;
  visit(scene.primitives);
  if (scene.groundPrimitives) visit(scene.groundPrimitives);

  return {
    kind: 'checked',
    frames: watched.frames,
    state: {
      canvasSized: scene.canvas.clientWidth > 0 && scene.canvas.clientHeight > 0,
      // Scene.setTerrain leaves the globe without a provider until the Terrain resolves.
      terrainReady: !scene.globe || scene.globe.terrainProvider !== undefined,
      globeTilesLoaded: scene.globe?.tilesLoaded ?? true,
      tileQueue: watched.tileQueue,
      tilesetsLoading,
      activeRequests: namespace?.RequestScheduler.statistics.numberOfActiveRequests ?? null,
      dataSourcesReady: widget.dataSourceDisplay?.ready ?? true,
      primitivesPending,
      modelTexturesLoading,
      billboardImagesLoading,
      tweensRunning: scene.tweens.length,
      fontsReady: document.fonts.status === 'loaded',
    },
  };
}
