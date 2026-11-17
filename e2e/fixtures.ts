/** Shared e2e helpers. The automatic `guard` fixture fails any test that logs a console error or throws. */
import { expect, test as base, type Page } from '@playwright/test';

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use, info) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await page.addInitScript(() => {
        try {
          if (!localStorage.getItem('ustoz.locale')) localStorage.setItem('ustoz.locale', 'uz');
        } catch {
          /* ignore */
        }
      });
      await use();
      if (errors.length) await info.attach('console-errors', { body: errors.join('\n') });
      expect(errors, 'console errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 600;

/** Opens the demo at a hash route and waits until the in-browser backend is ready. */
export async function open(page: Page, hash = '') {
  await page.goto(`./${hash ? `#${hash}` : ''}`);
  await expect(page.getByTestId('demo-badge')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('role-switch')).toBeVisible({ timeout: 60_000 });
}

export async function role(page: Page, name: 'Direktor' | 'Administrator' | "O'qituvchi" | "O'quvchi" | 'Ota-ona') {
  await page.getByTestId('role-switch').getByRole('radio', { name, exact: true }).click();
}

/** On a phone, staff see the panel and Telegram as two tabs. */
export async function showPhone(page: Page) {
  const tab = page.locator('.mobile-tabs').getByRole('button', { name: 'Telegram' });
  if (isPhone(page) && (await tab.count())) await tab.click();
}

export async function showPanel(page: Page) {
  if (isPhone(page)) await page.locator('.mobile-tabs').getByRole('button', { name: 'Panel' }).click();
}

export const toast = (page: Page) => page.locator('.toast').last();
