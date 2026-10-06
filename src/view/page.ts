import type { Cartesian3Like, Cartesian3Statics, WidgetLike } from '../cesium.js';
import type { CanvasPoint, Position, View } from './types.js';

export interface SetViewArgs {
  readonly widget: WidgetLike;
  readonly view: Required<View>;
}

/** Puts the camera exactly at a view, with no flight. */
export function setViewIn({ widget, view }: SetViewArgs): void {
  const { camera } = widget.scene;
  const Cartesian3 = (camera.position as unknown as { constructor: Cartesian3Statics }).constructor;
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  camera.setView({
    destination: Cartesian3.fromDegrees(view.lon, view.lat, view.height),
    orientation: {
      heading: radians(view.heading),
      pitch: radians(view.pitch),
      roll: radians(view.roll),
    },
  });
  widget.scene.requestRender();
}

export interface ProjectArgs {
  readonly widget: WidgetLike;
  readonly position: Required<Position>;
}

/**
 * Where a position lands on the canvas, in CSS pixels; null when it is behind the globe or off
 * the canvas.
 */
export function projectIn({ widget, position }: ProjectArgs): CanvasPoint | null {
  const { scene } = widget;
  const { camera } = scene;
  const Cartesian3 = (camera.position as unknown as { constructor: Cartesian3Statics }).constructor;
  const point = Cartesian3.fromDegrees(position.lon, position.lat, position.height);

  // Behind the globe, by the horizon test in a space where the ellipsoid is the unit sphere. Only
  // in 3D: a projected 2D or Columbus view map has no far side.
  const SCENE_3D = 3;
  const radii = scene.globe?.ellipsoid.radii;
  if (radii && scene.mode === SCENE_3D) {
    const scaled = (v: Cartesian3Like): [number, number, number] => [
      v.x / radii.x,
      v.y / radii.y,
      v.z / radii.z,
    ];
    const [cx, cy, cz] = scaled(camera.positionWC);
    const [px, py, pz] = scaled(point);
    const [tx, ty, tz] = [px - cx, py - cy, pz - cz];
    const toHorizonSquared = cx * cx + cy * cy + cz * cz - 1;
    const along = -(tx * cx + ty * cy + tz * cz);
    const occluded =
      along > toHorizonSquared &&
      (along * along) / (tx * tx + ty * ty + tz * tz) > toHorizonSquared;
    if (occluded) return null;
  }

  const canvasPoint = scene.cartesianToCanvasCoordinates(point);
  if (!canvasPoint) return null;
  const { x, y } = canvasPoint;
  const { clientWidth, clientHeight } = scene.canvas;
  if (!(x >= 0 && y >= 0 && x <= clientWidth && y <= clientHeight)) return null;
  return { x, y };
}
