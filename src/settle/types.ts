export interface SettleOptions {
  /** Consecutive frames with nothing loading before the scene counts as settled. Default: 10. */
  readonly frames?: number;
  /** How long to wait, in milliseconds; 0 waits as long as it takes. Default: 30 000. */
  readonly timeout?: number;
}

export interface SettleReport {
  /** Frames observed while waiting. */
  readonly frames: number;
  readonly elapsedMs: number;
}

/** One frame's account of everything that can still be loading. */
export interface SettleState {
  /** Cesium draws nothing into a canvas with no size. */
  readonly canvasSized: boolean;
  /** False while a terrain provider set through `Terrain` is still being created. */
  readonly terrainReady: boolean;
  readonly globeTilesLoaded: boolean;
  /** Tiles the globe last reported queued. */
  readonly tileQueue: number;
  readonly tilesetsLoading: number;
  /** Null when the page does not expose the Cesium namespace to read it from. */
  readonly activeRequests: number | null;
  readonly dataSourcesReady: boolean;
  readonly primitivesPending: number;
  /** glTF models drawing while their textures still load. */
  readonly modelTexturesLoading: number;
  /** Billboards with an image set that has not yet loaded. */
  readonly billboardImagesLoading: number;
  /** Camera flights and other tweens still running. */
  readonly tweensRunning: number;
  readonly fontsReady: boolean;
}

/** One look at the scene: what is loading, and how many frames Cesium has rendered so far. */
export type Check =
  | { readonly kind: 'checked'; readonly state: SettleState; readonly frames: number }
  | { readonly kind: 'render-error'; readonly message: string };
