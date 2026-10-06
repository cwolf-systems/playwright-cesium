import { test as base } from '@playwright/test';
import { attach } from './attach/attach.js';
import type { AttachOptions } from './attach/types.js';
import { useVirtualClock } from './clock/clock.js';
import type { VirtualClockOptions } from './clock/types.js';
import type { CesiumScene } from './scene.js';

/** The `cesium` fixture. */
export interface CesiumFixture {
  /** Attaches to the Viewer or CesiumWidget an expression evaluates to, such as `window.viewer`. */
  attach(expression: string, options?: AttachOptions): Promise<CesiumScene>;
  /**
   * Installs the virtual frame clock for the next navigation, so call it before `page.goto`: time
   * moves only as frames are stepped, and `Math.random` is seeded.
   */
  useVirtualClock(options?: VirtualClockOptions): Promise<void>;
}

/** Playwright's `test` with the `cesium` fixture. */
export const test = base.extend<{ cesium: CesiumFixture }>({
  cesium: async ({ page }, use) => {
    await use({
      attach: (expression, options) => attach(page, expression, options),
      useVirtualClock: (options) => useVirtualClock(page, options),
    });
  },
});

export { expect } from '@playwright/test';
