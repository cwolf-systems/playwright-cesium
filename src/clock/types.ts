/** A moment in time: a `Date`, or an ISO 8601 string such as `2026-06-21T14:00:00Z`. */
export type Instant = Date | string;

export interface VirtualClockOptions {
  /** Where virtual time starts. Default: J2000, 2000-01-01T12:00:00Z. */
  readonly start?: Instant;
  /** Seeds `Math.random`. Default: 1. */
  readonly seed?: number;
  /** Virtual milliseconds each frame advances. Default: 1000 / 60. */
  readonly frameMs?: number;
}

/** What the clock script receives in the page. */
export interface ClockScriptArgs {
  readonly startMs: number;
  readonly seed: number;
  readonly frameMs: number;
}

/** The handle the clock script leaves in the page. */
export interface VirtualClock {
  readonly frameMs: number;
  /** Moves time on and runs the animation-frame callbacks waiting for the next frame. */
  advance(ms: number): void;
}

/** The outcome of stepping frames. */
export type Steps =
  | { readonly kind: 'stepped'; readonly frames: number }
  | { readonly kind: 'render-error'; readonly message: string };
