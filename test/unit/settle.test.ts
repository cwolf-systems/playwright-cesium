import { describe, expect, it } from 'vitest';
import { NotSettledError, RenderError } from '../../src/errors.js';
import { describePending, isQuiet, settle, SettleTracker } from '../../src/settle/settle.js';
import type { Check, SettleState } from '../../src/settle/types.js';

const QUIET: SettleState = {
  canvasSized: true,
  terrainReady: true,
  globeTilesLoaded: true,
  tileQueue: 0,
  tilesetsLoading: 0,
  activeRequests: 0,
  dataSourcesReady: true,
  primitivesPending: 0,
  modelTexturesLoading: 0,
  billboardImagesLoading: 0,
  tweensRunning: 0,
  fontsReady: true,
};

const LOADING: SettleState = {
  canvasSized: false,
  terrainReady: false,
  globeTilesLoaded: false,
  tileQueue: 14,
  tilesetsLoading: 1,
  activeRequests: 2,
  dataSourcesReady: false,
  primitivesPending: 3,
  modelTexturesLoading: 2,
  billboardImagesLoading: 4,
  tweensRunning: 1,
  fontsReady: false,
};

/** Simulated time: waiting advances it, nothing else does. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    wait: (ms: number) => {
      time += ms;
      return Promise.resolve();
    },
  };
}

/**
 * A scene whose states play in order, repeating the last. `rendersOnItsOwn` says whether Cesium's
 * loop draws a new frame between checks; a requested render always draws one.
 */
function scene(states: SettleState[], rendersOnItsOwn = true) {
  let frames = 0;
  let index = 0;
  const renders: boolean[] = [];
  const checkScene = (render: boolean): Promise<Check> => {
    renders.push(render);
    if (rendersOnItsOwn || render) frames++;
    const state = states[Math.min(index++, states.length - 1)] ?? QUIET;
    return Promise.resolve({ kind: 'checked', state, frames });
  };
  return { checkScene, renders };
}

describe('what counts as quiet', () => {
  it('needs every condition met', () => {
    expect(isQuiet(QUIET)).toBe(true);
    for (const key of Object.keys(LOADING) as (keyof SettleState)[]) {
      expect(isQuiet({ ...QUIET, [key]: LOADING[key] })).toBe(false);
    }
  });

  it('treats an unknown request count as nothing in flight', () => {
    expect(isQuiet({ ...QUIET, activeRequests: null })).toBe(true);
  });
});

describe('describePending', () => {
  it('names everything still loading', () => {
    expect(describePending(LOADING)).toEqual([
      'the canvas has no size, so Cesium draws nothing',
      'terrain provider not yet created',
      'globe tiles loading',
      '14 globe tiles queued',
      '1 3D Tiles tileset loading',
      '2 requests in flight',
      'entities not yet built',
      '3 primitives not ready',
      '2 models still loading textures',
      '4 billboard images loading',
      '1 camera flight or tween running',
      'fonts loading',
    ]);
  });

  it('uses singular and plural forms, and leaves out what it cannot know', () => {
    const state = { ...QUIET, globeTilesLoaded: false, tilesetsLoading: 2, primitivesPending: 1 };
    expect(describePending({ ...state, activeRequests: null })).toEqual([
      'globe tiles loading',
      '2 3D Tiles tilesets loading',
      '1 primitive not ready',
    ]);
    const single = { ...QUIET, tileQueue: 1, activeRequests: 1, modelTexturesLoading: 1 };
    expect(describePending({ ...single, billboardImagesLoading: 1, tweensRunning: 2 })).toEqual([
      '1 globe tile queued',
      '1 request in flight',
      '1 model still loading textures',
      '1 billboard image loading',
      '2 camera flights or tweens running',
    ]);
  });
});

describe('SettleTracker', () => {
  it('needs consecutive quiet frames, and starts again after a busy one', () => {
    const tracker = new SettleTracker(3);
    expect([QUIET, QUIET, LOADING, QUIET, QUIET].map((s) => tracker.record(s))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(tracker.record(QUIET)).toBe(true);
  });

  it('says what was pending, or how far it got', () => {
    const tracker = new SettleTracker(10);
    expect(tracker.pending).toEqual(['no frame was rendered']);
    tracker.record(LOADING);
    expect(tracker.pending).toContain('fonts loading');
    tracker.record(QUIET);
    tracker.record(QUIET);
    expect(tracker.pending).toEqual(['nothing loading, but only for 2 of 10 frames']);
  });
});

describe('settle', () => {
  it('returns once enough frames in a row have nothing loading', async () => {
    const { checkScene } = scene([LOADING, LOADING, QUIET]);
    const report = await settle(checkScene, { frames: 3 }, fakeClock());
    expect(report.frames).toBe(5);
  });

  it('never renders a frame itself while Cesium keeps rendering', async () => {
    const { checkScene, renders } = scene([LOADING, LOADING, LOADING, QUIET]);
    await settle(checkScene, { frames: 3 }, fakeClock());
    expect(renders.every((render) => !render)).toBe(true);
  });

  it('renders one itself only once Cesium has rendered nothing for 250 ms', async () => {
    const { checkScene, renders } = scene([QUIET], false);
    await settle(checkScene, { frames: 2 }, fakeClock());
    const first = renders.indexOf(true);
    // A check every 16 ms: the first that may render is the one at or past 250 ms.
    expect(first).toBe(Math.ceil(250 / 16));
    expect(renders.slice(0, first).every((render) => !render)).toBe(true);
  });

  it('counts only checks that saw a new frame', async () => {
    let frames = 0;
    let checks = 0;
    const everyOtherCheck = (): Promise<Check> => {
      checks++;
      if (checks % 2 === 0) frames++;
      return Promise.resolve({ kind: 'checked', state: QUIET, frames });
    };
    const report = await settle(everyOtherCheck, { frames: 3 }, fakeClock());
    expect(report.frames).toBe(3);
    // The first check counts, having nothing to compare with; then new frames at checks 2 and 4.
    expect(checks).toBe(4);
  });

  it('fails with what was pending when the time runs out', async () => {
    const { checkScene } = scene([LOADING]);
    const result = settle(checkScene, { timeout: 1_000 }, fakeClock());
    await expect(result).rejects.toThrow(NotSettledError);
    await expect(
      settle(scene([LOADING]).checkScene, { timeout: 1_000 }, fakeClock()),
    ).rejects.toThrow(
      /did not settle within 1000 ms\. Still pending: the canvas has no size, so Cesium draws nothing;/,
    );
  });

  it('fails at once when Cesium stops rendering', async () => {
    let checks = 0;
    const broken = (): Promise<Check> => {
      checks++;
      return Promise.resolve({ kind: 'render-error', message: 'shader failed to compile' });
    };
    const result = settle(broken, {}, fakeClock());
    await expect(result).rejects.toThrow(RenderError);
    await expect(result).rejects.toThrow('Cesium stopped rendering: shader failed to compile');
    expect(checks).toBe(1);
  });

  it('waits as long as it takes when the timeout is 0', async () => {
    const clock = fakeClock();
    const busy = Array.from({ length: 5_000 }, () => LOADING);
    const report = await settle(
      scene([...busy, QUIET]).checkScene,
      { frames: 1, timeout: 0 },
      clock,
    );
    expect(report.frames).toBe(5_001);
    expect(clock.now()).toBeGreaterThan(30_000);
  });

  it('uses real time by default', async () => {
    const report = await settle(scene([QUIET]).checkScene, { frames: 1 });
    expect(report.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
