import { expect, test } from '@playwright/test';

test('the demo scene renders with no network beyond the local server', async ({
  page,
  baseURL,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL ?? '') && !/^(data|blob):/.test(url)) outside.push(url);
  });

  await page.goto('/');
  const body = page.locator('body');
  await page
    .locator('body[data-webgl], body[data-unsupported], body[data-error]')
    .waitFor({ state: 'attached' });
  const unsupported = await body.getAttribute('data-unsupported');
  test.skip(unsupported !== null, `CesiumJS cannot start in this browser here: ${unsupported}`);
  expect(await body.getAttribute('data-error')).toBeNull();

  await expect(page.locator('body[data-ready]')).toBeAttached({ timeout: 150_000 });
  expect(await body.getAttribute('data-error')).toBeNull();
  expect(outside).toEqual([]);
});
