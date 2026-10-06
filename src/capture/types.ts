/** 8-bit RGBA pixels, row by row from the top left, as playwright-perceptual reads them. */
export interface RgbaImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** A rectangle of the canvas in CSS pixels, from its top left. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Pixels as they cross from the page: base64 is far smaller than a list of numbers. */
export interface EncodedPixels {
  readonly base64: string;
  readonly width: number;
  readonly height: number;
}
