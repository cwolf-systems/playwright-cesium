export interface AttachOptions {
  /**
   * An expression for the page's `Cesium` namespace, used to read in-flight requests and the
   * version. Default: `window.Cesium`. Bundled applications that expose none still work; those two
   * readings are then left out.
   */
  readonly cesium?: string;
}

export interface SceneInfo {
  readonly widget: 'Viewer' | 'CesiumWidget';
  /** Null when the page does not expose the Cesium namespace. */
  readonly version: string | null;
  /** Whether the virtual frame clock is installed, so frames happen only when stepped. */
  readonly virtualClock: boolean;
}

/** What an attach expression evaluated to. */
export type Inspection =
  | ({ readonly kind: 'widget' } & SceneInfo)
  | { readonly kind: 'not-a-widget'; readonly found: string };

/** Kept in the page while attached: Cesium's render errors, its tile queue, and frames rendered. */
export interface Watch {
  readonly errors: string[];
  tileQueue: number;
  frames: number;
}
