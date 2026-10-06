import type { Watch } from '../attach/types.js';
import type { JulianDateStatics, WidgetLike } from '../cesium.js';
import type { ClockScriptArgs, Steps, VirtualClock } from './types.js';

export interface FreezeArgs {
  readonly widget: WidgetLike;
  readonly iso8601: string;
}

/** Stops Cesium's clock at an instant; returns the instant the clock now reads. */
export function freezeAt({ widget, iso8601 }: FreezeArgs): string {
  const { clock } = widget;
  const JulianDate = (clock.currentTime as { constructor: JulianDateStatics }).constructor;
  clock.shouldAnimate = false;
  clock.currentTime = JulianDate.fromIso8601(iso8601);
  widget.scene.requestRender();
  return JulianDate.toIso8601(clock.currentTime);
}

/**
 * Installed before the page's own scripts: virtual time for `Date` and `performance.now`, moving
 * only when a frame is stepped, animation frames that run only then, and a seeded `Math.random`.
 */
export function installVirtualClock({ startMs, seed, frameMs }: ClockScriptArgs): void {
  let elapsed = 0;
  const now = (): number => startMs + elapsed;

  const RealDate = Date;
  globalThis.Date = new Proxy(RealDate, {
    // Any Date argument list spreads through unchanged; the cast only names one of its forms.
    construct: (target, args: unknown[]) =>
      args.length === 0 ? new target(now()) : new target(...(args as [string])),
    apply: () => new RealDate(now()).toString(),
    get: (target, property, receiver) =>
      property === 'now' ? now : (Reflect.get(target, property, receiver) as unknown),
  });
  Object.defineProperty(performance, 'now', { value: () => elapsed, configurable: true });

  // mulberry32: small, fast and well distributed, and the same sequence for the same seed.
  let state = seed >>> 0;
  Math.random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Callbacks wait for the next stepped frame, so nothing renders on its own, before attaching
  // included; those a callback requests go to the frame after.
  let callbacks = new Map<number, FrameRequestCallback>();
  let lastHandle = 0;
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.set(++lastHandle, callback);
    return lastHandle;
  };
  globalThis.cancelAnimationFrame = (handle) => {
    callbacks.delete(handle);
  };

  const clock: VirtualClock = {
    frameMs,
    advance: (ms) => {
      elapsed += ms;
      const due = callbacks;
      callbacks = new Map();
      for (const callback of due.values()) {
        try {
          callback(elapsed);
        } catch (error) {
          reportError(error);
        }
      }
    },
  };
  Object.defineProperty(globalThis, '__playwrightCesiumClock', { value: clock });
}

export interface StepArgs {
  readonly widget: WidgetLike;
  readonly watched: Watch;
  readonly count: number;
}

/** Renders frames one at a time, advancing virtual time by a frame before each. */
export function stepFrames({ widget, watched, count }: StepArgs): Steps {
  const clock = (globalThis as { __playwrightCesiumClock?: VirtualClock }).__playwrightCesiumClock;
  for (let frame = 0; frame < count; frame++) {
    clock?.advance(clock.frameMs);
    widget.scene.requestRender();
    widget.render();
    const error = watched.errors[0];
    if (error !== undefined) return { kind: 'render-error', message: error };
  }
  return { kind: 'stepped', frames: count };
}
