import { randomUUID } from 'node:crypto';
import type { JSHandle, Page } from '@playwright/test';
import type { WidgetLike } from '../cesium.js';
import { DEFAULT_CESIUM_NAMESPACE } from '../defaults.js';
import { NotAViewerError } from '../errors.js';
import { AttachedScene, type CesiumScene } from '../scene.js';
import { inspect, namespaceOrNothing, tagCanvas, watch } from './page.js';
import type { AttachOptions } from './types.js';

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

/**
 * Attaches to the Viewer or CesiumWidget an expression evaluates to in the page, such as
 * `window.viewer`. Throws `NotAViewerError` if it evaluates to anything else.
 */
export async function attach(
  page: Page,
  expression: string,
  options: AttachOptions = {},
): Promise<CesiumScene> {
  let value: JSHandle<unknown>;
  try {
    value = await page.evaluateHandle(expression);
  } catch (error) {
    throw new NotAViewerError(expression, `an error: ${firstLine(error)}`);
  }
  const namespace = await page
    .evaluateHandle(options.cesium ?? DEFAULT_CESIUM_NAMESPACE)
    .then((found) => found.evaluateHandle(namespaceOrNothing))
    .catch(() => page.evaluateHandle(() => undefined));

  const inspection = await page.evaluate(inspect, { value, namespace });
  if (inspection.kind === 'not-a-widget') {
    await Promise.all([value.dispose(), namespace.dispose()]);
    throw new NotAViewerError(expression, inspection.found);
  }
  // inspect() has just checked that the value is a Viewer or a CesiumWidget.
  const widget = value as JSHandle<WidgetLike>;
  const watched = await widget.evaluateHandle(watch);
  const id = randomUUID();
  await page.evaluate(tagCanvas, { widget, id });
  return new AttachedScene(
    page,
    { widget, watched, namespace },
    {
      widget: inspection.widget,
      version: inspection.version,
      virtualClock: inspection.virtualClock,
    },
    page.locator(`canvas[data-playwright-cesium="${id}"]`),
  );
}
