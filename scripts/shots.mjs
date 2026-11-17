/**
 * README media: WebP screenshots and a short GIF of the "absence → parent notified" flow, taken from the
 * demo build. WebP is encoded by the browser (canvas.toDataURL), the GIF by gifenc — no native tools needed.
 *
 *   npm run build:demo && npm run preview -w @ustoz/web &   then:   PW_CHANNEL=chrome node scripts/shots.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const BASE = process.env.SHOTS_URL ?? 'http://localhost:4181/ustoz/';
const OUT = 'docs/media';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });

async function page(width, height, role = 'director', locale = 'en') {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'uz-UZ', timezoneId: 'Asia/Tashkent' });
  await ctx.addInitScript(([r, l]) => {
    sessionStorage.setItem('ustoz.role', r);
    localStorage.setItem('ustoz.locale', l);
  }, [role, locale]);
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.getByTestId('role-switch').waitFor({ timeout: 60_000 });
  return p;
}

/** PNG buffer → WebP via the page's canvas. */
async function webp(p, png, name, quality = 0.86) {
  const b64 = await p.evaluate(async ([src, q]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, [png.toString('base64'), quality]);
  writeFileSync(`${OUT}/${name}.webp`, Buffer.from(b64, 'base64'));
  console.log('wrote', name);
}

const settle = (p, ms = 1400) => p.waitForTimeout(ms);
const shot = async (p, name) => webp(p, await p.screenshot(), name);

// ── desktop screenshots ──
let p = await page(1440, 900, 'director');
await settle(p, 2200);
await shot(p, 'dashboard');
for (const [hash, name] of [['/p/leads', 'leads'], ['/p/schedule', 'schedule'], ['/p/billing', 'billing'], ['/p/tests', 'tests']]) {
  await p.evaluate((h) => (location.hash = h), hash);
  await settle(p, 1800);
  if (name === 'tests') {
    await p.getByRole('button', { name: 'Present Simple (English grammar)' }).click();
    await settle(p, 1500);
  }
  await shot(p, name);
}
await p.context().close();

p = await page(1440, 900, 'student');
await settle(p, 2000);
await shot(p, 'student-mini-app');
await p.context().close();

// ── phone (375 px) ──
p = await page(375, 812, 'parent');
await settle(p, 2000);
await shot(p, 'phone-parent-bot');
await p.context().close();

// ── GIF: an absence is marked, the parent's Telegram lights up ──
p = await page(1440, 900, 'director');
await p.evaluate(() => (location.hash = '/p/attendance'));
await settle(p, 1800);
const W = 960;
const H = 600;
const gif = GIFEncoder();
async function frame(delay = 120) {
  const png = await p.screenshot();
  const rgba = await p.evaluate(async ([src, w, h]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return Array.from(g.getImageData(0, 0, w, h).data);
  }, [png.toString('base64'), W, H]);
  const data = Uint8Array.from(rgba);
  const palette = quantize(data, 128);
  gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
}
await frame(900);
const pick = p.getByTestId('lesson-pick').filter({ hasText: /A2-14|Kids Stars/ }).first();
if (await pick.count()) {
  await pick.click();
  await settle(p, 900);
  await frame(700);
  const child = p.getByTestId('register-row').filter({ hasText: /Aziz Karimov|Madina Karimova/ });
  await p.getByRole('button', { name: 'All present' }).click();
  await settle(p, 500);
  await frame(500);
  await child.getByRole('radio', { name: 'Absent' }).click();
  await settle(p, 500);
  await frame(700);
  await p.getByTestId('save-register').click();
  for (let k = 0; k < 6; k++) {
    await settle(p, 250);
    await frame(220);
  }
  await settle(p, 800);
  await frame(2600);
}
gif.finish();
writeFileSync(`${OUT}/absence-to-parent.gif`, gif.bytes());
console.log('wrote absence-to-parent.gif');
await browser.close();
