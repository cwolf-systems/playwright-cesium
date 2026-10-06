import { describe, expect, it } from 'vitest';
import { decodePixels, resolveRegion } from '../../src/capture/capture.js';
import { toIso8601 } from '../../src/defaults.js';
import { InvalidOptionError } from '../../src/errors.js';
import { resolvePosition, resolveView } from '../../src/view/view.js';

describe('views and positions', () => {
  it('fill in a ground-level height and a straight-down camera', () => {
    expect(resolvePosition({ lon: -116.2, lat: 43.6 })).toEqual({
      lon: -116.2,
      lat: 43.6,
      height: 0,
    });
    expect(resolveView({ lon: 0, lat: 0, height: 1_000 })).toEqual({
      lon: 0,
      lat: 0,
      height: 1_000,
      heading: 0,
      pitch: -90,
      roll: 0,
    });
  });

  it.each([
    { lon: 181, lat: 0 },
    { lon: 0, lat: -91 },
    { lon: Number.NaN, lat: 0 },
    { lon: 0, lat: 0, height: Number.POSITIVE_INFINITY },
  ])('reject the position %o', (position) => {
    expect(() => resolvePosition(position)).toThrow(InvalidOptionError);
  });

  it.each([
    { lon: 0, lat: 0, pitch: -91 },
    { lon: 0, lat: 0, heading: Number.NaN },
    { lon: 0, lat: 0, roll: Number.NEGATIVE_INFINITY },
  ])('reject the view %o', (view) => {
    expect(() => resolveView(view)).toThrow(InvalidOptionError);
  });
});

describe('instants', () => {
  it('read Dates and ISO 8601 strings', () => {
    expect(toIso8601('2026-06-21T14:00:00Z')).toBe('2026-06-21T14:00:00.000Z');
    expect(toIso8601(new Date(Date.UTC(2026, 5, 21, 4)))).toBe('2026-06-21T04:00:00.000Z');
  });

  it('reject what is not a date', () => {
    expect(() => toIso8601('midsummer')).toThrow(InvalidOptionError);
    expect(() => toIso8601(new Date(Number.NaN))).toThrow(/time must be a valid Date/);
  });
});

describe('regions and pixels', () => {
  it('accept whole coordinates and a positive size', () => {
    const region = { x: 0, y: 10, width: 64, height: 32 };
    expect(resolveRegion(region)).toBe(region);
  });

  it.each([
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0.5, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
  ])('reject the region %o', (region) => {
    expect(() => resolveRegion(region)).toThrow(InvalidOptionError);
  });

  it('decode what the page sends', () => {
    const bytes = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const image = decodePixels({
      base64: Buffer.from(bytes).toString('base64'),
      width: 2,
      height: 1,
    });
    expect(image).toEqual({ data: bytes, width: 2, height: 1 });
  });
});
