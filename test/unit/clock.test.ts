import { describe, expect, it } from 'vitest';
import { resolveClockOptions } from '../../src/defaults.js';
import { InvalidOptionError, VirtualClockRequiredError } from '../../src/errors.js';

describe('virtual clock options', () => {
  it('start at J2000, seed 1 and sixty frames a second by default', () => {
    expect(resolveClockOptions()).toEqual({
      startMs: Date.UTC(2000, 0, 1, 12),
      seed: 1,
      frameMs: 1000 / 60,
    });
  });

  it('take a start as a Date or a string', () => {
    expect(resolveClockOptions({ start: '2026-06-21T14:00:00Z' }).startMs).toBe(
      Date.UTC(2026, 5, 21, 14),
    );
    expect(resolveClockOptions({ start: new Date(0), seed: 42, frameMs: 40 })).toEqual({
      startMs: 0,
      seed: 42,
      frameMs: 40,
    });
  });

  it.each([{ seed: 1.5 }, { frameMs: 0 }, { frameMs: Number.NaN }, { start: 'later' }])(
    'reject %o',
    (options) => {
      expect(() => resolveClockOptions(options)).toThrow(InvalidOptionError);
    },
  );

  it('say how to get the clock when it is missing', () => {
    expect(new VirtualClockRequiredError('scene.step()').message).toBe(
      'scene.step() needs the virtual frame clock: call cesium.useVirtualClock() before page.goto()',
    );
  });
});
