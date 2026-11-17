/**
 * @ustoz/seed — the demo centre.
 *
 *   seedStatic   people and structure (baked into the demo snapshot at build time)
 *   seedTimeline everything relative to "today" (run on every boot: ~1 s of bulk inserts in PGlite)
 *
 * Splitting it this way means the demo never shows stale dates and never depends on the bake date.
 */
import { todayIn } from '@ustoz/core';
import { insertMany, json, type Database, type Sql } from '@ustoz/db';
import { seedActivity, at } from './activity';
import { DEMO_CERT_SECRET } from './data';
import { seedLearning } from './learning';
import { CENTRE_ID, id, seedStatic } from './static';

export * from './data';
export { CENTRE_ID, id as demoId, roster, personaStudentName, personaSiblingName } from './static';
export { plan } from './activity';

export async function isSeeded(db: Database): Promise<boolean> {
  try {
    const [r] = await db.query<{ n: number }>('select count(*)::int as n from centres');
    return (r?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function hasTimeline(db: Database): Promise<boolean> {
  const [r] = await db.query<{ n: number }>('select count(*)::int as n from groups');
  return (r?.n ?? 0) > 0;
}

export async function seedStaticData(db: Database): Promise<void> {
  await db.transaction((tx) => seedStatic(tx));
}

/** A few past bot messages so the persona chats are not empty on first open. */
async function seedHistory(tx: Sql, now: Date): Promise<void> {
  const aziz = (await tx.query<{ id: string }>(`select id from students where full_name = 'Aziz Karimov'`))[0]!.id;
  const madina = (await tx.query<{ id: string }>(`select id from students where full_name = 'Madina Karimova'`))[0]!.id;
  const parent = id('parent:karimova');
  const [late] = await tx.query<{ date: string; name: string; startMin: number; endMin: number }>(
    `select a.date, g.name, g.start_min, g.end_min from attendance a join groups g on g.id = a.group_id where a.student_id = $1 and a.status = 'late' order by a.date desc limit 1`, [aziz]);
  const pays = await tx.query<{ amount: number; method: string; receiptNo: string; paidAt: string; studentId: string }>(
    `select amount, method, receipt_no, paid_at, student_id from payments where student_id = any($1::uuid[]) order by paid_at desc limit 2`, [[aziz, madina]]);
  const [graded] = await tx.query<{ title: string; grade: number; feedback: string; gradedAt: string }>(
    `select h.title, s.grade, s.feedback, s.graded_at from submissions s join homework h on h.id = s.homework_id where s.student_id = $1 and s.grade is not null order by s.graded_at desc limit 1`, [aziz]);
  const rows: unknown[][] = [];
  const push = (kind: 'parent' | 'student', who: string, tg: number, template: string, params: Record<string, unknown>, when: string) =>
    rows.push([CENTRE_ID, id(`outbox:${template}:${kind}:${when}`), tg, kind, who, template, json(params), 'uz', when, when]);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  if (late) push('parent', parent, 700_000_105, 'late', { student: 'Aziz Karimov', group: late.name, date: late.date, time: `${hhmm(late.startMin)}–${hhmm(late.endMin)}`, streak: 0 }, at(late.date, Math.floor(late.startMin / 60), 20));
  for (const p of pays) push('parent', parent, 700_000_105, 'payment_received', { amount: p.amount, method: p.method, receiptNo: p.receiptNo, balance: 0, student: p.studentId === aziz ? 'Aziz Karimov' : 'Madina Karimova' }, p.paidAt);
  if (graded) {
    push('student', aziz, 700_000_104, 'homework_graded', { student: 'Aziz Karimov', title: graded.title, grade: graded.grade, feedback: graded.feedback }, graded.gradedAt);
    push('parent', parent, 700_000_105, 'homework_graded', { student: 'Aziz Karimov', title: graded.title, grade: graded.grade, feedback: graded.feedback }, graded.gradedAt);
  }
  const nowIso = now.toISOString();
  await insertMany(tx, 'outbox', ['centre_id', 'id', 'recipient_tg', 'recipient_kind', 'recipient_id', 'template', 'params', 'locale', 'created_at', 'sent_at'], rows.filter((r) => (r[8] as string) <= nowIso));
}

/** Everything relative to `now`. Runs in one transaction; safe on any calendar date. */
export async function seedTimeline(db: Database, opts: { now?: Date; certSecret?: string } = {}): Promise<{ today: string; attendance: number; invoices: number; payments: number }> {
  const now = opts.now ?? new Date();
  const today = todayIn(now);
  return db.transaction(async (tx) => {
    const r = await seedActivity(tx, now, today);
    await seedLearning(tx, now, today, opts.certSecret ?? DEMO_CERT_SECRET);
    await seedHistory(tx, now);
    return { today, ...r };
  });
}

export async function seedDemo(db: Database, opts: { now?: Date; certSecret?: string } = {}) {
  await seedStaticData(db);
  return seedTimeline(db, opts);
}
