import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'test/browser',
  outputDir: 'test-results/browser',
  snapshotPathTemplate: 'test-results/snapshots/{projectName}/{arg}{ext}',
  // Software rendering on CI settles a scene several times slower than a desktop GPU
  // (docs/benchmarks/platforms.md), slower again with tests running side by side, and some tests
  // load the scene twice.
  timeout: 180_000,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 640, height: 360 } },
  webServer: {
    command: `node demo/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  // Firefox is measured by the platform probe but not tested on each commit: it has no WebGL on
  // GitHub's Linux runners and takes about 40 s per scene on macOS runners
  // (docs/benchmarks/platforms.md).
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
