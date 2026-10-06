/** A place on the globe: degrees, and metres above the ellipsoid. */
export interface Position {
  readonly lon: number;
  readonly lat: number;
  /** Default: 0. */
  readonly height?: number;
}

/** A camera: where it is, and which way it looks, in degrees. */
export interface View extends Position {
  /** Clockwise from north. Default: 0. */
  readonly heading?: number;
  /** Negative looks down; -90 looks straight down. Default: -90. */
  readonly pitch?: number;
  /** Default: 0. */
  readonly roll?: number;
}

/** A point on the canvas in CSS pixels, from its top left. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}
