import type { JSHandle, Locator, Page } from '@playwright/test';
import type { SceneInfo, Watch } from './attach/types.js';
import { decodePixels, resolveRegion } from './capture/capture.js';
import { readPixels } from './capture/page.js';
import type { Region, RgbaImage } from './capture/types.js';
import type { CesiumNamespaceLike, WidgetLike } from './cesium.js';
import { toIso8601 } from './defaults.js';
import { InvalidOptionError, RenderError, VirtualClockRequiredError } from './errors.js';
import { freezeAt, stepFrames } from './clock/page.js';
import type { Instant } from './clock/types.js';
import { check } from './settle/page.js';
import { settle } from './settle/settle.js';
import type { SettleOptions, SettleReport } from './settle/types.js';
import { projectIn, setViewIn } from './view/page.js';
import type { CanvasPoint, Position, View } from './view/types.js';
import { resolvePosition, resolveView } from './view/view.js';

/** A Cesium scene in a page, from `cesium.attach` or `attach`. */
export interface CesiumScene {
  readonly info: SceneInfo;
  /** The scene's canvas, for screenshot assertions. */
  readonly canvas: Locator;
  /**
   * Waits until nothing is loading for several frames in a row: globe and 3D Tiles, requests,
   * entities, primitives and fonts. It renders frames itself only when Cesium renders none.
   * Throws `NotSettledError` with what was still pending if the time runs out, and `RenderError`
   * at once if Cesium stops rendering.
   */
  settled(options?: SettleOptions): Promise<SettleReport>;
  /**
   * Stops Cesium's clock at an instant, so the sun, lighting and time-dynamic entities hold still.
   * Returns the instant the clock now reads, as ISO 8601.
   */
  freeze(time: Instant): Promise<string>;
  /** Puts the camera exactly at a view, with no flight. */
  setView(view: View): Promise<void>;
  /**
   * Where a position lands on the canvas, in CSS pixels; null when it is behind the globe or off
   * the canvas.
   */
  project(position: Position): Promise<CanvasPoint | null>;
  /** Renders a frame and reads its pixels, or a region's, at the canvas's own resolution. */
  pixels(region?: Region): Promise<RgbaImage>;
  /**
   * Renders exactly `count` frames, each advancing virtual time by one frame. Needs the virtual
   * frame clock; throws `VirtualClockRequiredError` without it.
   */
  step(count?: number): Promise<void>;
}

/** The page objects an attached scene works through. */
export interface SceneHandles {
  readonly widget: JSHandle<WidgetLike>;
  readonly watched: JSHandle<Watch>;
  readonly namespace: JSHandle<CesiumNamespaceLike | undefined>;
}

/** The scene behind the `CesiumScene` interface. Each capability lives in its own module. */
export class AttachedScene implements CesiumScene {
  constructor(
    private readonly page: Page,
    private readonly handles: SceneHandles,
    readonly info: SceneInfo,
    readonly canvas: Locator,
  ) {}

  settled(options?: SettleOptions): Promise<SettleReport> {
    // Under the virtual frame clock Cesium renders nothing on its own, so every look steps a frame.
    const { virtualClock } = this.info;
    return settle(
      (render) => this.page.evaluate(check, { ...this.handles, render: virtualClock || render }),
      options,
    );
  }

  freeze(time: Instant): Promise<string> {
    const iso8601 = toIso8601(time);
    return this.page.evaluate(freezeAt, { widget: this.handles.widget, iso8601 });
  }

  setView(view: View): Promise<void> {
    return this.page.evaluate(setViewIn, { widget: this.handles.widget, view: resolveView(view) });
  }

  project(position: Position): Promise<CanvasPoint | null> {
    const resolved = resolvePosition(position);
    return this.page.evaluate(projectIn, { widget: this.handles.widget, position: resolved });
  }

  async step(count = 1): Promise<void> {
    if (!this.info.virtualClock) throw new VirtualClockRequiredError('scene.step()');
    if (!(Number.isInteger(count) && count >= 1)) {
      throw new InvalidOptionError('count', count, 'a whole number ≥ 1');
    }
    const steps = await this.page.evaluate(stepFrames, {
      widget: this.handles.widget,
      watched: this.handles.watched,
      count,
    });
    if (steps.kind === 'render-error') throw new RenderError(steps.message);
  }

  async pixels(region?: Region): Promise<RgbaImage> {
    const area = region === undefined ? null : resolveRegion(region);
    return decodePixels(
      await this.page.evaluate(readPixels, { widget: this.handles.widget, region: area }),
    );
  }
}
