import { InvalidOptionError } from '../errors.js';
import type { EncodedPixels, Region, RgbaImage } from './types.js';

/** A region checked for whole, non-negative coordinates and a positive size. */
export function resolveRegion(region: Region): Region {
  for (const [option, value, min] of [
    ['region.x', region.x, 0],
    ['region.y', region.y, 0],
    ['region.width', region.width, 1],
    ['region.height', region.height, 1],
  ] as const) {
    if (!(Number.isInteger(value) && value >= min)) {
      throw new InvalidOptionError(option, value, `a whole number ≥ ${min}`);
    }
  }
  return region;
}

export const decodePixels = ({ base64, width, height }: EncodedPixels): RgbaImage => ({
  data: new Uint8Array(Buffer.from(base64, 'base64')),
  width,
  height,
});
