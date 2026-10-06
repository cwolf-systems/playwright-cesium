import type { Page } from '@playwright/test';
import { resolveClockOptions } from '../defaults.js';
import { installVirtualClock } from './page.js';
import type { VirtualClockOptions } from './types.js';

/**
 * Installs the virtual frame clock for the page's next navigation, so call it before `page.goto`.
 * Time then moves only as frames are stepped, and `Math.random` is seeded.
 */
export async function useVirtualClock(
  page: Page,
  options: VirtualClockOptions = {},
): Promise<void> {
  await page.addInitScript(installVirtualClock, resolveClockOptions(options));
}
