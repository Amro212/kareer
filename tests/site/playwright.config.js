import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'website.spec.js',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4177', headless: true, screenshot: 'only-on-failure' },
  webServer: {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    command: 'npm run preview --prefix site -- --host 127.0.0.1 --port 4177 --strictPort',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: !process.env.CI,
  },
});
