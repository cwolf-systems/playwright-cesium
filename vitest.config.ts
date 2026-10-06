import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [{ test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } }],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Browser-side and Playwright-facing code is covered by test/browser.
      exclude: [
        'src/index.ts',
        'src/**/types.ts',
        'src/cesium.ts',
        'src/**/page.ts',
        'src/attach/attach.ts',
        'src/clock/clock.ts',
        'src/scene.ts',
        'src/fixture.ts',
      ],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 },
    },
  },
});
