import { setTimeout as delay } from 'node:timers/promises';
import { resolveSettleOptions } from '../defaults.js';
import { NotSettledError, RenderError } from '../errors.js';
import type { Check, SettleOptions, SettleReport, SettleState } from './types.js';

/** Time between looks at the scene: about one display frame. */
const CHECK_INTERVAL_MS = 16;

/**
 * How long Cesium may render nothing before the loop renders a frame itself, as it must in
 * request-render mode, under a paused clock, or when the render loop has stopped. While Cesium is
 * rendering, even slowly under software rendering, the loop adds no frames of its own: extra
 * frames would take the main thread from the tile and network work the scene is waiting on.
 */
const RENDER_AFTER_MS = 250;

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** For each part of a frame's state, what it says is still pending, or null for nothing. */
const PENDING: { readonly [K in keyof SettleState]: (value: SettleState[K]) => string | null } = {
  canvasSized: (sized) => (sized ? null : 'the canvas has no size, so Cesium draws nothing'),
  terrainReady: (ready) => (ready ? null : 'terrain provider not yet created'),
  globeTilesLoaded: (loaded) => (loaded ? null : 'globe tiles loading'),
  tileQueue: (n) => (n > 0 ? `${count(n, 'globe tile', 'globe tiles')} queued` : null),
  tilesetsLoading: (n) =>
    n > 0 ? `${count(n, '3D Tiles tileset', '3D Tiles tilesets')} loading` : null,
  activeRequests: (n) => (n ? `${count(n, 'request', 'requests')} in flight` : null),
  dataSourcesReady: (ready) => (ready ? null : 'entities not yet built'),
  primitivesPending: (n) => (n > 0 ? `${count(n, 'primitive', 'primitives')} not ready` : null),
  modelTexturesLoading: (n) =>
    n > 0 ? `${count(n, 'model', 'models')} still loading textures` : null,
  billboardImagesLoading: (n) =>
    n > 0 ? `${count(n, 'billboard image', 'billboard images')} loading` : null,
  tweensRunning: (n) =>
    n > 0 ? `${count(n, 'camera flight or tween', 'camera flights or tweens')} running` : null,
  fontsReady: (ready) => (ready ? null : 'fonts loading'),
};

const describe = <K extends keyof SettleState>(key: K, value: SettleState[K]): string | null =>
  PENDING[key](value);

/** What a frame reported as still loading, in words. */
export const describePending = (state: SettleState): string[] =>
  (Object.keys(PENDING) as (keyof SettleState)[]).flatMap((key) => describe(key, state[key]) ?? []);

/** Whether nothing was loading during a frame. */
export const isQuiet = (state: SettleState): boolean => describePending(state).length === 0;

/** Counts consecutive quiet frames until there have been enough. */
export class SettleTracker {
  private quietFrames = 0;
  private last: SettleState | null = null;

  constructor(private readonly needed: number) {}

  /** Records one frame's state; true once enough consecutive frames have been quiet. */
  record(state: SettleState): boolean {
    this.last = state;
    this.quietFrames = isQuiet(state) ? this.quietFrames + 1 : 0;
    return this.quietFrames >= this.needed;
  }

  /** What was still pending at the last frame. */
  get pending(): readonly string[] {
    if (this.last === null) return ['no frame was rendered'];
    const loading = describePending(this.last);
    if (loading.length > 0) return loading;
    return [`nothing loading, but only for ${this.quietFrames} of ${this.needed} frames`];
  }
}

/** Looks at the scene, rendering a frame first when asked. */
export type CheckScene = (render: boolean) => Promise<Check>;

/** Real time and waiting, injected so the loop can be tested without a browser or a clock. */
export interface Effects {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<unknown>;
}

const REAL: Effects = { now: Date.now, wait: delay };

/**
 * Watches the scene until enough consecutive frames have had nothing loading. Fails at once on a
 * render error, and with what was still pending when the time runs out.
 */
export async function settle(
  checkScene: CheckScene,
  options: SettleOptions = {},
  { now, wait }: Effects = REAL,
): Promise<SettleReport> {
  const { frames, timeoutMs } = resolveSettleOptions(options);
  const tracker = new SettleTracker(frames);
  const started = now();
  let seenFrames = -1;
  let lastFrameAt = started;
  let observed = 0;
  for (;;) {
    const check = await checkScene(now() - lastFrameAt >= RENDER_AFTER_MS);
    if (check.kind === 'render-error') throw new RenderError(check.message);
    if (check.frames !== seenFrames) {
      seenFrames = check.frames;
      lastFrameAt = now();
      observed++;
      if (tracker.record(check.state)) return { frames: observed, elapsedMs: now() - started };
    }
    if (now() - started >= timeoutMs) throw new NotSettledError(timeoutMs, tracker.pending);
    await wait(CHECK_INTERVAL_MS);
  }
}
