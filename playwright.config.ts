/**
 * End-to-end tests against `vite preview` of the demo build (backend in a Web Worker, pre-baked snapshot).
 *
 *   npm run build:demo && PW_CHANNEL=chrome npm run e2e
 *   E2E_BASE_URL=https://xoliddev.github.io/ustoz/ npm run e2e     # against the live demo
 *
 * Two viewports: 1440 px (panel + phone frame) and 375 px (real phone: no frame). Any console error fails a test.
 */
import { defineConfig, devices } from '@playwright/test';

const external = process.env.E2E_BASE_URL;
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: external ?? 'http://localhost:4181/ustoz/',
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    { name: 'phone-375', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: false } },
  ],
  webServer: external
    ? undefined
    : { command: 'npm run preview -w @ustoz/web', url: 'http://localhost:4181/ustoz/', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
