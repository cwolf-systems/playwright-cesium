import type { ClockScriptArgs, Instant, VirtualClockOptions } from './clock/types.js';
import { InvalidOptionError } from './errors.js';
import type { SettleOptions } from './settle/types.js';

/** Frames with nothing loading before a scene counts as settled, as CesiumJS #13864 recommends. */
export const DEFAULT_SETTLE_FRAMES = 10;
export const DEFAULT_SETTLE_TIMEOUT_MS = 30_000;
export const DEFAULT_CESIUM_NAMESPACE = 'window.Cesium';

/** J2000, the standard astronomical epoch: a fixed start that does not age with the calendar. */
export const DEFAULT_CLOCK_START = '2000-01-01T12:00:00Z';
export const DEFAULT_CLOCK_SEED = 1;
export const DEFAULT_FRAME_MS = 1000 / 60;

/** An instant as an ISO 8601 string Cesium can read, or an error naming what was wrong. */
export function toIso8601(time: Instant): string {
  const date = typeof time === 'string' ? new Date(time) : time;
  if (Number.isNaN(date.getTime())) {
    throw new InvalidOptionError('time', time, 'a valid Date or ISO 8601 date and time');
  }
  return date.toISOString();
}

export interface ResolvedSettleOptions {
  readonly frames: number;
  /** Infinity for no limit. */
  readonly timeoutMs: number;
}

export function resolveSettleOptions(options: SettleOptions = {}): ResolvedSettleOptions {
  const frames = options.frames ?? DEFAULT_SETTLE_FRAMES;
  const timeout = options.timeout ?? DEFAULT_SETTLE_TIMEOUT_MS;
  if (!(Number.isInteger(frames) && frames >= 1)) {
    throw new InvalidOptionError('frames', frames, 'a whole number ≥ 1');
  }
  if (!(timeout >= 0)) {
    throw new InvalidOptionError('timeout', timeout, 'a number of milliseconds ≥ 0');
  }
  // As in Playwright, a timeout of 0 means none.
  return { frames, timeoutMs: timeout === 0 ? Number.POSITIVE_INFINITY : timeout };
}

/** Clock options checked and filled in, as the page script takes them. */
export function resolveClockOptions(options: VirtualClockOptions = {}): ClockScriptArgs {
  const seed = options.seed ?? DEFAULT_CLOCK_SEED;
  const frameMs = options.frameMs ?? DEFAULT_FRAME_MS;
  if (!Number.isSafeInteger(seed)) throw new InvalidOptionError('seed', seed, 'a whole number');
  if (!(Number.isFinite(frameMs) && frameMs > 0)) {
    throw new InvalidOptionError('frameMs', frameMs, 'a number of milliseconds > 0');
  }
  return {
    startMs: Date.parse(toIso8601(options.start ?? DEFAULT_CLOCK_START)),
    seed,
    frameMs,
  };
}
