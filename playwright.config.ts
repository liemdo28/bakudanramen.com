import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './qa',
  timeout: 30000,
  retries: 1,
  workers: 3,
  reporter: [
    ['list'],
    ['json', { outputFile: 'qa/reports/playwright-results.json' }],
    ['html', { outputFolder: 'qa/reports/playwright-html', open: 'never' }],
  ],
  use: {
    baseURL: 'https://www.bakudanramen.com',
    headless: true,
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
});
