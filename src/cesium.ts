// The members of Cesium objects this package touches, described structurally. Nothing imports
// Cesium itself, so the package works with whatever build of it an application ships.

export interface CesiumEvent<Args extends unknown[]> {
  /** Returns a function that removes the listener. */
  addEventListener(listener: (...args: Args) => void): () => void;
}

export interface PrimitiveCollectionLike {
  readonly length: number;
  get(index: number): unknown;
}

export interface Cartesian3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Statics reached through an instance's constructor, so no `Cesium` global is needed. */
export interface Cartesian3Statics {
  fromDegrees(longitude: number, latitude: number, height?: number): Cartesian3Like;
}

export interface JulianDateStatics {
  fromIso8601(iso8601: string): unknown;
  toIso8601(date: unknown): string;
}

export interface ClockLike {
  currentTime: unknown;
  shouldAnimate: boolean;
}

export interface CameraLike {
  /** In the camera's reference frame, which a transform such as `lookAt` sets. */
  readonly position: Cartesian3Like;
  /** In world coordinates, whatever the camera's transform. */
  readonly positionWC: Cartesian3Like;
  /** Radians. */
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  /** Radians, and metres above the ellipsoid. */
  readonly positionCartographic: {
    readonly longitude: number;
    readonly latitude: number;
    readonly height: number;
  };
  setView(options: {
    destination: Cartesian3Like;
    orientation: { heading: number; pitch: number; roll: number };
  }): void;
}

export interface SceneLike {
  readonly canvas: HTMLCanvasElement;
  readonly camera: CameraLike;
  /** Absent when the viewer was created with `globe: false`. */
  readonly globe?: {
    readonly tilesLoaded: boolean;
    readonly tileLoadProgressEvent: CesiumEvent<[queued: number]>;
    readonly ellipsoid: { readonly radii: Cartesian3Like };
    /** Undefined while a `Terrain` set on the scene is still being created. */
    readonly terrainProvider: unknown;
  };
  /** `SceneMode`: 3 is 3D; 2D and Columbus view draw a projected map. */
  readonly mode: number;
  /** Camera flights and other animations in progress. */
  readonly tweens: { readonly length: number };
  readonly primitives: PrimitiveCollectionLike;
  readonly groundPrimitives?: PrimitiveCollectionLike;

  readonly postRender: CesiumEvent<[scene: unknown, time: unknown]>;
  readonly renderError: CesiumEvent<[scene: unknown, error: unknown]>;

  /** In request-render mode, a frame is drawn only once requested. */
  requestRender(): void;
  /** Canvas coordinates in CSS pixels, or undefined where the position cannot be shown. */
  cartesianToCanvasCoordinates(position: Cartesian3Like): { x: number; y: number } | undefined;
}

/** A Viewer or a CesiumWidget. */
export interface WidgetLike {
  readonly scene: SceneLike;
  readonly clock: ClockLike;
  /** Whether Cesium drives its own render loop with `requestAnimationFrame`. */
  useDefaultRenderLoop: boolean;
  render(): void;
  /** Viewer only. */
  readonly dataSourceDisplay?: { readonly ready: boolean };
}

/** The parts of the `Cesium` namespace used, where the page exposes it. */
export interface CesiumNamespaceLike {
  readonly VERSION: string;
  readonly RequestScheduler: {
    readonly statistics: { readonly numberOfActiveRequests: number };
  };
}
