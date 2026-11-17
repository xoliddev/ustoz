/**
 * Measures the demo's first visit in a fresh browser profile: from navigation until the dashboard is on screen
 * (backend booted from the snapshot, today's timeline seeded, first queries answered).
 *   node scripts/measure-first-visit.mjs [url] [runs]        (PW_CHANNEL=chrome to use the system Chrome)
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4181/ustoz/';
const runs = Number(process.argv[3] ?? 3);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const times = [];
const boots = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', (m) => msgs.push(m.text()));
  const t = Date.now();
  await page.goto(url);
  await page.getByTestId('kpi-rev').waitFor({ timeout: 120_000 });
  times.push(Date.now() - t);
  const boot = msgs.map((m) => /ready in (\d+) ms/.exec(m)?.[1]).find(Boolean);
  if (boot) boots.push(Number(boot));
  await ctx.close();
}
await browser.close();
const fmt = (xs) => xs.map((x) => `${(x / 1000).toFixed(2)} s`).join(', ');
console.log(`first visit (dashboard visible): ${fmt(times)}\nin-browser backend boot: ${fmt(boots)}`);
