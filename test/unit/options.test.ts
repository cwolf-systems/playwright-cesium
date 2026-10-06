import { describe, expect, it } from 'vitest';
import { resolveSettleOptions } from '../../src/defaults.js';
import {
  InvalidOptionError,
  NotAViewerError,
  NotSettledError,
  RenderError,
} from '../../src/errors.js';

describe('settle options', () => {
  it('fill in defaults, and read a timeout of 0 as no limit', () => {
    expect(resolveSettleOptions()).toEqual({ frames: 10, timeoutMs: 30_000 });
    expect(resolveSettleOptions({ timeout: 0 }).timeoutMs).toBe(Number.POSITIVE_INFINITY);
  });

  it.each([{ frames: 0 }, { frames: 2.5 }, { timeout: -1 }, { timeout: Number.NaN }])(
    'reject %o',
    (options) => {
      expect(() => resolveSettleOptions(options)).toThrow(InvalidOptionError);
    },
  );
});

describe('errors', () => {
  it('say what went wrong and carry the details', () => {
    const notAViewer = new NotAViewerError('window.document', 'a HTMLDocument');
    expect(notAViewer.message).toBe(
      'window.document is not a Cesium Viewer or CesiumWidget: it evaluated to a HTMLDocument',
    );
    expect(notAViewer.name).toBe('NotAViewerError');
    const notSettled = new NotSettledError(1000, ['fonts loading', '2 requests in flight']);
    expect(notSettled.message).toBe(
      'The scene did not settle within 1000 ms. Still pending: fonts loading; 2 requests in flight.',
    );
    expect(notSettled.pending).toEqual(['fonts loading', '2 requests in flight']);
    expect(new RenderError('boom').cesiumMessage).toBe('boom');
    expect(new InvalidOptionError('frames', 0, 'a whole number ≥ 1').message).toBe(
      'frames must be a whole number ≥ 1, got 0',
    );
  });
});
