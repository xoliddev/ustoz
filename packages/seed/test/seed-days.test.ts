/**
 * The demo must work on ANY calendar date (a sibling project's demo once broke on one specific day).
 * We seed the timeline for 14 consecutive days in three windows — starting today, across New Year and
 * across a leap-year February — and check invariants plus every persona's main screens each day.
 */
import { describe, expect, it } from 'vitest';
import { addDays, findConflicts, LocalTestGenerator, todayIn, type Role } from '@ustoz/core';
import { computeInvoice, createBackend, migrate, type Actor } from '@ustoz/db';
import { createPglite, wrapPglite } from '@ustoz/db/pglite';
import { DEMO_CERT_SECRET, PERSONAS, seedStaticData, seedTimeline } from '../src';

const TIMELINE = ['outbox', 'lead_events', 'leads', 'certificates', 'test_attempts', 'tests', 'submissions', 'homework', 'payment_txns', 'payments', 'invoices', 'prepaid_plans', 'attendance', 'enrollments', 'groups', 'audit_log'];

async function world() {
  const pg = await createPglite();
  const db = wrapPglite(pg);
  await migrate(db);
  await seedStaticData(db);
  let now = new Date();
  const be = createBackend({
    db, clock: { now: () => now }, certSecret: DEMO_CERT_SECRET, verifyBase: 'x/', testGenerator: new LocalTestGenerator(),
    payments: { checkout: () => ({ url: 'x', params: {} }) },
  });
  const as = {} as Record<Role, Actor>;
  for (const role of Object.keys(PERSONAS) as Role[]) as[role] = (await be.signIn(PERSONAS[role], { role })).actor;
  return {
    db, be, as,
    async day(instant: Date) {
      now = instant;
      await db.exec(`truncate ${TIMELINE.join(', ')} cascade`);
      return seedTimeline(db, { now: instant });
    },
    close: () => pg.close(),
  };
}

async function checkDay(w: Awaited<ReturnType<typeof world>>, instant: Date, deep: boolean) {
  const r = await w.day(instant);
  const today = todayIn(instant);
  expect(r.today).toBe(today);
  expect(r.attendance).toBeGreaterThan(300);
  expect(r.invoices).toBeGreaterThan(100);
  const m = w.be.methods;
  const [bad] = await w.db.query<{ n: number }>(
    `select (select count(*) from attendance where date >= $1::date) + (select count(*) from payments where paid_at > $2) + (select count(*) from invoices where total < 0) as n`, [today, instant.toISOString()]);
  expect(bad!.n).toBe(0);
  const groups = await m['groups.list'](w.as.admin, {});
  expect(findConflicts(groups.map((g) => ({ id: g.id, roomId: g.roomId, teacherId: g.teacherId, days: g.days, start: g.startMin, end: g.endMin, from: g.startsOn, to: g.endsOn })))).toEqual([]);
  const d = await m['dashboard.summary'](w.as.director, {});
  expect(d.activeStudents).toBeGreaterThan(100);
  expect(d.revenue.reduce((s, x) => s + x.collected, 0)).toBeGreaterThan(0);
  await m['attendance.today'](w.as.teacher, {});
  await m['schedule.week'](w.as.student, {});
  await m['billing.statement'](w.as.parent, {});
  await m['billing.debtors'](w.as.admin, {});
  await m['leads.stats'](w.as.admin, {});
  await m['payroll.report'](w.as.director, { month: today.slice(0, 7) });
  await m['progress.student'](w.as.parent, {});
  const tests = await m['tests.mine'](w.as.student, {});
  expect(tests.some((t) => !t.attempted)).toBe(true);
  const hw = await m['homework.mine'](w.as.student, {});
  expect(hw.some((h) => !h.submissionId)).toBe(true);
  const chat = await m['notifications.mine'](w.as.parent, {});
  expect(chat.length).toBeGreaterThan(0);
  // the teacher always has a lesson to mark within the coming week
  const week = await m['schedule.week'](w.as.teacher, { weekOf: today });
  const next = await m['schedule.week'](w.as.teacher, { weekOf: addDays(today, 7) });
  expect(week.lessons.length + next.lessons.length).toBeGreaterThan(0);
  if (deep) {
    // seeded invoices are exactly what the live billing code would compute
    const inv = await w.db.query<{ enrollmentId: string; month: string; total: number; prorated: number }>('select enrollment_id, month, total, prorated from invoices');
    await w.db.transaction(async (tx) => {
      for (const i of inv) {
        const c = await computeInvoice(tx, i.enrollmentId, i.month);
        expect({ total: c!.calc.total, prorated: c!.calc.prorated }, `${i.enrollmentId} ${i.month}`).toEqual({ total: i.total, prorated: i.prorated });
      }
    });
  }
}

const windows: Array<{ name: string; start: Date }> = [
  { name: 'the next 14 days', start: new Date() },
  { name: 'across New Year', start: new Date('2026-12-24T04:00:00Z') },
  { name: 'across a leap February', start: new Date('2028-02-22T15:30:00Z') },
];

describe.each(windows)('demo seed on 14 consecutive days: $name', ({ start }) => {
  it('works every day', async () => {
    const w = await world();
    for (let k = 0; k < 14; k++) await checkDay(w, new Date(start.getTime() + k * 86_400_000), k === 0 || k === 13);
    await w.close();
  });
});

describe('late-evening edge', () => {
  it('works at 23:59 and 00:01 Tashkent time', async () => {
    const w = await world();
    await checkDay(w, new Date('2026-11-30T18:59:00Z'), false);
    await checkDay(w, new Date('2026-11-30T19:01:00Z'), false);
    await w.close();
  });
});
