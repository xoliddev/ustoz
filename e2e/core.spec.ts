import { expect, isPhone, open, role, showPanel, showPhone, test, toast } from './fixtures';

test('boots in the browser and says so', async ({ page }) => {
  const t0 = Date.now();
  await open(page);
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'first-visit-ms', description: String(ms) });
  await expect(page.getByTestId('demo-badge')).toHaveText("Demo rejim — hammasi brauzeringizda ishlaydi");
  await page.getByLabel('Language').selectOption('en');
  await expect(page.getByTestId('demo-badge')).toHaveText('Demo mode — runs entirely in your browser');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByTestId('kpi-rev')).toContainText('UZS');
});

test('phone frame on desktop, full screen on a phone, no sideways scroll', async ({ page }) => {
  await open(page);
  await role(page, "O'quvchi");
  if (isPhone(page)) {
    await expect(page.getByTestId('phone-frame')).toHaveCount(0);
    await expect(page.getByTestId('mini-student')).toBeVisible();
  } else {
    const frame = page.getByTestId('phone-frame');
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(392 / 832, 2);
    await expect(frame.locator('.phone-island')).toBeVisible();
    await expect(frame.locator('.phone-clock')).toHaveText(/^\d{1,2}:\d{2}$/);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('an absence is marked → the parent gets a bot message at once', async ({ page }) => {
  await open(page, '/p/attendance');
  // Aziz (A2-14) studies Mon/Wed/Fri and his sister Madina (Kids Stars) Tue/Thu/Sat
  await expect(page.getByTestId('lesson-pick').first().or(page.getByText("Bugun darsingiz yo'q"))).toBeVisible();
  const pick = page.getByTestId('lesson-pick').filter({ hasText: /A2-14|Kids Stars/ });
  if ((await page.getByTestId('lesson-pick').count()) === 0 || (await pick.count()) === 0) test.skip(true, 'Sunday: no lessons');
  await pick.first().click();
  const child = page.getByTestId('register-row').filter({ hasText: /Aziz Karimov|Madina Karimova/ });
  await expect(child).toBeVisible();
  const name = (await child.textContent())!.includes('Aziz') ? 'Aziz Karimov' : 'Madina Karimova';
  await page.getByRole('button', { name: 'Hammasi keldi' }).click();
  await child.getByRole('radio', { name: 'Kelmadi' }).click();
  await page.getByTestId('save-register').click();
  await expect(toast(page)).toContainText('Ota-onalarga xabar: ');
  await showPhone(page);
  await expect(page.getByTestId('bot-notification').filter({ hasText: `${name} bugun darsga kelmadi` })).toBeVisible();
});

test("teacher's Mini App lists today's lessons and opens the register", async ({ page }) => {
  await open(page);
  await role(page, "O'qituvchi");
  await showPhone(page);
  await page.getByTestId('tg-tab-app').click();
  await expect(page.getByTestId('mini-teacher')).toBeVisible();
  const lessons = page.getByTestId('teacher-lesson');
  await expect(lessons.first().or(page.getByText("Bugun darsingiz yo'q"))).toBeVisible();
  if ((await lessons.count()) === 0) return;
  await lessons.first().click();
  await expect(page.locator('.register.compact')).toBeVisible();
});

test('director: dashboard reminder and the payroll report', async ({ page }) => {
  await open(page, '/p/dashboard');
  await expect(page.getByTestId('risk-list')).toBeVisible();
  await page.getByRole('button', { name: 'Eslatma yuborish' }).click();
  await expect(toast(page)).toContainText('eslatma yuborildi');
  await page.goto('./#/p/payroll');
  await expect(page.getByTestId('payslip').first()).toBeVisible();
  expect(await page.getByTestId('payslip').count()).toBe(8);
});

test('schedule: a clashing group is flagged live, a free slot saves', async ({ page }) => {
  await open(page, '/p/schedule');
  await expect(page.getByTestId('tt-lesson').first()).toBeVisible();
  await page.getByRole('button', { name: 'Yangi guruh' }).click();
  const dlg = page.getByRole('dialog', { name: 'Yangi guruh' });
  await dlg.getByPlaceholder('IELTS 7.0 · Weekend').fill('Test guruh');
  await dlg.getByLabel('Xona').selectOption({ label: '101 · Oxford' });
  await dlg.getByLabel('Boshlanishi').fill('09:30');
  await dlg.getByLabel('Tugashi').fill('11:00');
  await expect(dlg.getByTestId('conflicts')).toContainText('A2-14');
  await expect(dlg.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
  await dlg.getByLabel('Boshlanishi').fill('11:00');
  await dlg.getByLabel('Tugashi').fill('12:30');
  await expect(dlg.getByTestId('conflicts')).toContainText("To'qnashuv yo'q");
  await dlg.getByRole('button', { name: 'Saqlash' }).click();
  await expect(toast(page)).toContainText('Guruh yaratildi');
});

test('admin takes a cash payment and prints a receipt', async ({ page }) => {
  await open(page);
  await role(page, 'Administrator');
  await page.goto('./#/p/students');
  await page.getByRole('radio', { name: 'Qarzdorlar' }).click();
  await page.getByTestId('student-row').first().click();
  const pay = page.getByTestId('take-payment');
  await expect(pay).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /so'm$/ }).first().click();
  await pay.click();
  await expect(page.getByTestId('receipt')).toContainText(/R-\d{4}-\d{6}/);
});

test('phone: staff switch between the panel and Telegram', async ({ page }) => {
  test.skip(!isPhone(page), 'phone layout only');
  await open(page);
  await showPhone(page);
  await expect(page.getByTestId('bot-parent')).toBeVisible();
  await showPanel(page);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
});
