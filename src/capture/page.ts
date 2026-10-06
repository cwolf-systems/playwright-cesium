import type { WidgetLike } from '../cesium.js';
import type { EncodedPixels, Region } from './types.js';

export interface ReadPixelsArgs {
  readonly widget: WidgetLike;
  readonly region: Region | null;
}

/**
 * Renders a frame and copies the canvas in the same task, before the browser may clear the drawing
 * buffer, so no `preserveDrawingBuffer` is needed. Reads at the canvas's own resolution.
 */
export function readPixels({ widget, region }: ReadPixelsArgs): EncodedPixels {
  const { scene } = widget;
  const { canvas } = scene;
  scene.requestRender();
  widget.render();

  const scale = canvas.width / canvas.clientWidth;
  const area = region ?? { x: 0, y: 0, width: canvas.clientWidth, height: canvas.clientHeight };
  const sx = Math.round(area.x * scale);
  const sy = Math.round(area.y * scale);
  const width = Math.min(Math.round(area.width * scale), canvas.width - sx);
  const height = Math.min(Math.round(area.height * scale), canvas.height - sy);
  if (width <= 0 || height <= 0) {
    throw new Error(
      `the region lies outside the ${canvas.clientWidth}×${canvas.clientHeight} canvas`,
    );
  }

  const copy = document.createElement('canvas');
  copy.width = width;
  copy.height = height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('a 2D canvas is not available to copy the scene into');
  context.drawImage(canvas, sx, sy, width, height, 0, 0, width, height);
  const bytes = context.getImageData(0, 0, width, height).data;

  // In chunks: one call with every byte would overflow the argument limit.
  const CHUNK = 0x8000;
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return { base64: btoa(binary), width, height };
}
