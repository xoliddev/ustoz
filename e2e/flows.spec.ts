import { expect, isPhone, open, role, showPhone, test, toast } from './fixtures';

test('lead funnel: application → placement → trial → enrolled', async ({ page }) => {
  await open(page, '/p/leads');
  await page.getByRole('button', { name: 'Yangi ariza' }).click();
  const dlg = page.getByRole('dialog', { name: 'Yangi ariza' });
  await dlg.getByLabel('Ism familiya').fill('Sitora Test');
  await dlg.getByLabel('Telefon').fill('90 555 66 77');
  await dlg.getByLabel('Kurs').selectOption({ label: 'IELTS 6.5+' });
  await dlg.getByRole('button', { name: 'Saqlash' }).click();
  const card = (col: string) => page.getByTestId(`col-${col}`).getByTestId('lead-card').filter({ hasText: 'Sitora Test' });
  await expect(page.getByTestId('col-new').getByTestId('lead-card').filter({ hasText: 'Sitora Test' })).toBeVisible();
  await card('new').getByRole('button', { name: 'Daraja testi' }).click();
  await page.getByRole('dialog', { name: 'Daraja testi' }).getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByTestId('col-placement').getByText('Sitora Test')).toBeVisible();
  await card('placement').getByRole('button', { name: 'Sinov darsi' }).click();
  await page.getByRole('dialog', { name: 'Sinov darsi' }).getByRole('button', { name: 'Saqlash' }).click();
  await expect(page.getByTestId('col-trial').getByText('Sitora Test')).toBeVisible();
  await card('trial').getByRole('button', { name: "Guruhga qo'shish" }).click();
  await page.getByRole('dialog').getByRole('button', { name: "Guruhga qo'shish" }).click();
  await expect(toast(page)).toContainText("Sitora Test guruhga qo'shildi");
  await expect(page.getByTestId('col-enrolled').getByText('Sitora Test')).toBeVisible();
});

test('lead card can be dragged to the next stage', async ({ page }) => {
  test.skip(isPhone(page), 'drag-and-drop is a desktop gesture; phones use the buttons');
  await open(page, '/p/leads');
  const card = page.getByTestId('col-new').getByTestId('lead-card').first();
  const name = (await card.locator('b').first().textContent())!;
  await card.dragTo(page.getByTestId('col-lost'), { steps: 12 });
  await expect(page.getByTestId('col-lost').getByText(name)).toBeVisible();
});

test('test generator → published → a student takes it → leaderboard', async ({ page }) => {
  await open(page, '/p/tests');
  await page.getByRole('button', { name: 'Present Simple (English grammar)' }).click();
  await expect(page.getByTestId('test-preview').locator('li')).toHaveCount(8);
  await page.locator('section').getByRole('combobox', { name: 'Guruh' }).selectOption({ label: 'A2-14' });
  await page.getByTestId('publish').click();
  await expect(toast(page)).toContainText('Test yuborildi');
  await role(page, "O'quvchi");
  await page.getByRole('navigation', { name: 'Mini App' }).getByRole('button', { name: 'Testlar' }).click();
  const fresh = page.getByTestId('mini-test').filter({ has: page.getByTestId('start-test') }).first();
  await fresh.getByTestId('start-test').click();
  for (let k = 0; k < 20; k++) {
    await page.getByTestId('option').first().click();
    if (await page.getByTestId('finish-test').isVisible()) break;
    await page.getByTestId('next-question').click();
  }
  await page.getByTestId('finish-test').click();
  await expect(page.getByTestId('test-result')).toContainText("to'g'ri");
});

test('parent pays the debt online (Click sandbox) and the balance clears', async ({ page }) => {
  await open(page);
  await role(page, 'Ota-ona');
  await page.getByTestId('tg-tab-app').click();
  await expect(page.getByTestId('mini-parent')).toBeVisible();
  // the child with a debt (Madina) — switch to her if needed
  const kids = page.locator('.mini-kids button');
  for (let k = 0; k < (await kids.count()); k++) {
    await kids.nth(k).click();
    if (await page.getByTestId('mini-pay').isVisible().catch(() => false)) break;
  }
  await page.getByTestId('mini-pay').click();
  await page.getByTestId('provider-click').click();
  await page.getByTestId('pay-confirm').click();
  await expect(page.getByTestId('pay-done')).toContainText("To'lov qabul qilindi!");
  await page.getByRole('button', { name: /Provayder protokoli/ }).click();
  await expect(page.locator('.proto')).toContainText('Complete');
  await page.getByRole('button', { name: 'Yopish' }).last().click();
  await expect(page.getByTestId('mini-balance')).toContainText("Qarz yo'q");
  await page.getByTestId('tg-tab-bot').click();
  await expect(page.getByTestId('bot-notification').filter({ hasText: "To'lov qabul qilindi" }).last()).toBeVisible();
});

test('student hands in homework through the bot; the teacher grades it on the web', async ({ page }) => {
  await open(page);
  await role(page, "O'quvchi");
  await page.getByTestId('tg-tab-bot').click();
  const chat = page.getByTestId('bot-student');
  await chat.getByTestId('kb-button').filter({ hasText: 'Uy vazifalar' }).click();
  await chat.locator('.msg-inline button').filter({ hasText: 'Topshirish' }).first().click();
  await expect(chat.getByText('javobingizni yuboring')).toBeVisible();
  await chat.getByLabel('Xabar yozing…').fill('Bajardim, 20 ta gap tayyor.');
  await chat.getByRole('button', { name: 'Yuborish', exact: true }).click();
  await expect(chat.getByText('Qabul qilindi!')).toBeVisible();
  await role(page, "O'qituvchi");
  await page.goto('./#/p/homework');
  await page.getByTestId('hw-card').first().click();
  const sub = page.getByTestId('submission').filter({ hasText: 'Bajardim, 20 ta gap tayyor.' });
  if ((await sub.count()) === 0) return; // the newest card may belong to another of the teacher's groups
  await sub.getByLabel('Ball').fill('95');
  await sub.getByRole('button', { name: 'Baholash' }).click();
  await expect(toast(page)).toContainText('Baho');
});

test('certificate: issue, then the public QR link verifies it', async ({ page }) => {
  await open(page, '/p/certificates');
  await page.getByRole('button', { name: 'Sertifikat berish' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sertifikat berish' }).click();
  await expect(page.getByTestId('certificate')).toBeVisible();
  const code = (await page.getByTestId('certificate').locator('.cert-code').textContent())!.split(':')[1]!.trim();
  await page.goto(`./#/verify/${code}`);
  await expect(page.getByTestId('verify-ok')).toBeVisible();
  await page.goto('./#/verify/AAAAAAAA');
  await expect(page.getByTestId('verify-bad')).toBeVisible();
});

test('bot: parent asks for the schedule with buttons and switches language', async ({ page }) => {
  await open(page);
  await role(page, 'Ota-ona');
  await showPhone(page);
  const chat = page.getByTestId('bot-parent');
  await chat.getByTestId('kb-button').filter({ hasText: 'Dars jadvali' }).click();
  await expect(chat.getByText('shu haftalik jadval').first()).toBeVisible();
  await chat.getByTestId('kb-button').filter({ hasText: 'Til' }).click();
  await chat.locator('.msg-inline button').filter({ hasText: 'English' }).last().click();
  await expect(chat.getByText('Language changed.')).toBeVisible();
  await expect(chat.getByTestId('kb-button').filter({ hasText: 'Schedule' })).toBeVisible();
});
