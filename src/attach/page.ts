import type { CesiumNamespaceLike, WidgetLike } from '../cesium.js';
import type { Inspection, Watch } from './types.js';

export interface InspectArgs {
  readonly value: unknown;
  readonly namespace: CesiumNamespaceLike | undefined;
}

/** Whether a value is a Viewer or a CesiumWidget, and which; otherwise, what it is. */
export function inspect({ value, namespace }: InspectArgs): Inspection {
  const candidate = value as Partial<WidgetLike> | null | undefined;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.render === 'function' &&
    typeof candidate.scene === 'object'
  ) {
    return {
      kind: 'widget',
      widget: 'cesiumWidget' in candidate ? 'Viewer' : 'CesiumWidget',
      version: namespace?.VERSION ?? null,
      virtualClock: '__playwrightCesiumClock' in globalThis,
    };
  }
  if (value === null || value === undefined) return { kind: 'not-a-widget', found: String(value) };
  if (typeof value !== 'object') return { kind: 'not-a-widget', found: `a ${typeof value}` };
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  return { kind: 'not-a-widget', found: name ? `a ${name}` : 'an object' };
}

/**
 * Starts recording Cesium's render errors, its tile queue and its frames for the widget. Under the
 * virtual frame clock it also stops Cesium's own render loop, so frames happen only when stepped.
 */
export function watch(widget: WidgetLike): Watch {
  const watched: Watch = { errors: [], tileQueue: 0, frames: 0 };
  if ('__playwrightCesiumClock' in globalThis) widget.useDefaultRenderLoop = false;
  widget.scene.renderError.addEventListener((_scene, error) => {
    watched.errors.push(error instanceof Error ? error.message : String(error));
  });
  widget.scene.globe?.tileLoadProgressEvent.addEventListener((queued) => {
    watched.tileQueue = queued;
  });
  widget.scene.postRender.addEventListener(() => {
    watched.frames++;
  });
  return watched;
}

/** The value if it looks like the Cesium namespace, otherwise nothing. */
export function namespaceOrNothing(value: unknown): CesiumNamespaceLike | undefined {
  const candidate = value as Partial<CesiumNamespaceLike> | null | undefined;
  return typeof candidate?.VERSION === 'string' &&
    typeof candidate.RequestScheduler?.statistics.numberOfActiveRequests === 'number'
    ? (candidate as CesiumNamespaceLike)
    : undefined;
}

export interface TagArgs {
  readonly widget: WidgetLike;
  readonly id: string;
}

/** Marks the scene's canvas so a locator can find it, even with several viewers on a page. */
export function tagCanvas({ widget, id }: TagArgs): void {
  widget.scene.canvas.dataset.playwrightCesium = id;
}
