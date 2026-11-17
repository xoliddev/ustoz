/**
 * Everything that depends on "today": groups' start dates, enrolments, attendance, invoices, payments,
 * homework, tests, certificates, leads and notification history. Pure computation with core's real
 * billing logic, then bulk inserts — so it is fast enough to run in the browser on every first visit and
 * can never go stale or break on a particular calendar date (see test/seed-days.test.ts).
 */
import {
  addDays, addMonths, datesOn, fnv1a, invoiceFor, minDate, monthEnd, monthOf, parseTime, rng, SIBLING_BP, type Discount, type IsoDate,
} from '@ustoz/core';
import { insertMany, json, type Sql } from '@ustoz/db';
import { COURSES, GROUPS, ROOMS } from './data';
import { CENTRE_ID, id, roster, type DemoStudent } from './static';

export interface Activity {
  today: IsoDate;
  now: Date;
  groups: Array<{ key: string; id: string; startsOn: IsoDate; days: number[]; fee: number; start: number; end: number; teacher: string; name: string; course: string }>;
  enrollments: Array<{ id: string; student: DemoStudent; groupKey: string; joinedOn: IsoDate; leftOn: IsoDate | null; prepaid: boolean }>;
}

/** "YYYY-MM-DD" + local hour → ISO instant (Tashkent is UTC+5). */
export const at = (date: IsoDate, hour: number, minute = 0) => new Date(Date.parse(`${date}T00:00:00Z`) + ((hour - 5) * 60 + minute) * 60_000).toISOString();

export function plan(now: Date, today: IsoDate): Activity {
  const groups = GROUPS.map((g) => {
    const course = COURSES.find((c) => c.key === g.course)!;
    return { key: g.key, id: id(`group:${g.key}`), startsOn: addDays(today, -g.startedAgo), days: [...g.days], fee: course.fee, start: parseTime(g.start), end: parseTime(g.end), teacher: g.teacher, name: g.name, course: g.course };
  });
  const { students } = roster();
  const r = rng(77);
  const enrollments = students.map((s) => {
    const g = groups.find((x) => x.key === s.group)!;
    let joinedOn = g.startsOn;
    // the last two of an older group joined recently (shows proration)
    const def = GROUPS.find((x) => x.key === s.group)!;
    if (def.startedAgo > 35 && s.slot >= def.size - 2) joinedOn = addDays(today, -(3 + Math.floor(r() * 9)));
    // one student per long-running group left three weeks ago
    const leftOn = def.startedAgo > 60 && s.slot === def.size - 3 ? addDays(today, -21) : null;
    return { id: id(`enr:${s.key}`), student: s, groupKey: s.group, joinedOn, leftOn: leftOn && leftOn > joinedOn ? leftOn : null, prepaid: s.slot === 2 && (s.group === 'ielts-1' || s.group === 'py-1' || s.group === 'math-1') };
  });
  return { today, now, groups, enrollments };
}

const STATUS = (x: number) => (x < 0.86 ? 'present' : x < 0.92 ? 'late' : x < 0.98 ? 'absent' : 'excused');

export async function seedActivity(tx: Sql, now: Date, today: IsoDate): Promise<{ attendance: number; invoices: number; payments: number }> {
  const p = plan(now, today);
  const r = rng(fnv1a('activity'));
  const month = monthOf(today);

  await insertMany(tx, 'groups', ['centre_id', 'id', 'course_id', 'teacher_id', 'room_id', 'branch_id', 'name', 'days', 'start_min', 'end_min', 'starts_on', 'monthly_fee', 'capacity'],
    p.groups.map((g) => {
      const def = GROUPS.find((x) => x.key === g.key)!;
      const room = ROOMS.find((x) => x.key === def.room)!;
      return [CENTRE_ID, g.id, id(`course:${g.course}`), id(`teacher:${g.teacher}`), id(`room:${room.key}`), id(`branch:${room.branch}`), g.name, g.days, g.start, g.end, g.startsOn, g.fee, room.capacity];
    }));
  await insertMany(tx, 'enrollments', ['centre_id', 'id', 'group_id', 'student_id', 'joined_on', 'left_on', 'created_at'],
    p.enrollments.map((e) => [CENTRE_ID, e.id, id(`group:${e.groupKey}`), e.student.id, e.joinedOn, e.leftOn, at(e.joinedOn, 10)]));

  // ── attendance up to yesterday (today's registers are left for the teacher to mark) ──
  const risky = new Set(p.enrollments.filter((e) => e.student.slot === 4 && ['a2-1', 'ielts-1', 'math-1', 'react-1', 'pre-1'].includes(e.groupKey)).map((e) => e.id));
  const attRows: unknown[][] = [];
  const teacherUser = id('user:teacher');
  for (const e of p.enrollments) {
    const g = p.groups.find((x) => x.key === e.groupKey)!;
    const from = e.joinedOn > g.startsOn ? e.joinedOn : g.startsOn;
    const to = minDate(addDays(today, -1), e.leftOn ?? '9999-12-31');
    const dates = datesOn(g.days, from, to);
    const reliability = 0.75 + r() * 0.25;
    dates.forEach((d, k) => {
      let status = STATUS(r() * reliability + (1 - reliability) * r());
      if (e.student.name === 'Aziz Karimov') status = k === dates.length - 2 ? 'late' : 'present';
      if (risky.has(e.id) && k >= dates.length - 3) status = 'absent';
      attRows.push([CENTRE_ID, g.id, e.student.id, d, status, teacherUser, at(d, Math.floor(g.end / 60))]);
    });
  }
  await insertMany(tx, 'attendance', ['centre_id', 'group_id', 'student_id', 'date', 'status', 'marked_by', 'marked_at'], attRows, 600);

  // ── invoices (core.invoiceFor with sibling and prepaid discounts, exactly as billing-core does) ──
  const sameFamily = new Map<string, typeof p.enrollments>();
  for (const e of p.enrollments) if (e.student.parentId) sameFamily.set(e.student.parentId, [...(sameFamily.get(e.student.parentId) ?? []), e]);
  /** Same rule as billing-core: an older sibling is enrolled and active during that month. */
  const hasOlderSibling = (e: (typeof p.enrollments)[number], mo: string) =>
    !!e.student.parentId &&
    (sameFamily.get(e.student.parentId) ?? []).some((o) => o.student.id !== e.student.id && o.joinedOn <= monthEnd(mo) && (!o.leftOn || o.leftOn >= `${mo}-01`) &&
      (o.joinedOn < e.joinedOn || (o.joinedOn === e.joinedOn && o.student.id < e.student.id)));
  const invRows: unknown[][] = [];
  const planRows: unknown[][] = [];
  const invoices: Array<{ enr: (typeof p.enrollments)[number]; month: string; total: number }> = [];
  for (const e of p.enrollments) {
    const g = p.groups.find((x) => x.key === e.groupKey)!;
    const startMonth = monthOf(e.joinedOn > g.startsOn ? e.joinedOn : g.startsOn);
    const lastMonth = startMonth > month ? startMonth : e.prepaid ? addMonths(month, 2) : month;
    if (e.prepaid) planRows.push([CENTRE_ID, id(`plan:${e.id}`), e.id, month, 3, 500]);
    for (let mo = startMonth; mo <= lastMonth; mo = addMonths(mo, 1)) {
      const ds: Discount[] = [];
      if (hasOlderSibling(e, mo)) ds.push({ kind: 'sibling', bp: SIBLING_BP });
      if (e.prepaid && mo >= month) ds.push({ kind: 'prepaid', bp: 500 });
      const c = invoiceFor({ monthlyFee: g.fee, days: g.days, joinedOn: e.joinedOn, leftOn: e.leftOn, groupStartsOn: g.startsOn }, mo, ds);
      if (c.lessonsBilled === 0) continue;
      invRows.push([CENTRE_ID, id(`inv:${e.id}:${mo}`), e.id, e.student.id, g.id, mo, c.base, c.prorated, json(c.discounts), c.total, c.lessonsBilled, c.lessonsInMonth, at(`${mo}-01`, 6)]);
      invoices.push({ enr: e, month: mo, total: c.total });
    }
  }
  await insertMany(tx, 'prepaid_plans', ['centre_id', 'id', 'enrollment_id', 'from_month', 'months', 'bp'], planRows);
  await insertMany(tx, 'invoices', ['centre_id', 'id', 'enrollment_id', 'student_id', 'group_id', 'month', 'base', 'prorated', 'discounts', 'total', 'lessons_billed', 'lessons_in_month', 'created_at'], invRows);

  // ── payments: older months mostly paid on time, a few debtors, the current month partly paid ──
  const day = Number(today.slice(8));
  const debtor = (e: (typeof p.enrollments)[number]) => e.student.slot === 5 || (e.student.slot === 7 && e.groupKey.startsWith('ielts'));
  const METHODS = ['cash', 'cash', 'card', 'payme', 'click', 'uzum', 'transfer'] as const;
  const pays: Array<{ id: string; student: string; amount: number; method: string; paidAt: string }> = [];
  for (const inv of invoices) {
    const e = inv.enr;
    if (e.prepaid && inv.month >= month) continue;
    const earliest = e.joinedOn > `${inv.month}-01` ? e.joinedOn : `${inv.month}-01`;
    if (earliest > today) continue;
    const current = inv.month === month;
    if (current && (debtor(e) || e.student.name === 'Madina Karimova' || r() > (day >= 10 ? 0.9 : 0.45))) continue;
    if (!current && debtor(e) && inv.month === addMonths(month, -1)) continue;
    let payDay = addDays(earliest, Math.floor(r() * 7));
    if (payDay > today) payDay = today;
    pays.push({ id: id(`pay:${e.id}:${inv.month}`), student: e.student.id, amount: inv.total, method: METHODS[Math.floor(r() * METHODS.length)]!, paidAt: at(payDay, 9 + Math.floor(r() * 9), Math.floor(r() * 60)) });
  }
  for (const e of p.enrollments.filter((x) => x.prepaid)) {
    const total = invoices.filter((x) => x.enr.id === e.id && x.month >= month).reduce((s, x) => s + x.total, 0);
    const payDay = e.joinedOn > `${month}-01` ? e.joinedOn : `${month}-01`;
    if (total > 0 && payDay <= today) pays.push({ id: id(`pay:${e.id}:prepaid`), student: e.student.id, amount: total, method: 'card', paidAt: at(payDay, 11) });
  }
  pays.sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : a.id < b.id ? -1 : 1));
  const nowIso = now.toISOString();
  const valid = pays.filter((x) => x.paidAt <= nowIso);
  await insertMany(tx, 'payments', ['centre_id', 'id', 'student_id', 'amount', 'method', 'status', 'receipt_no', 'paid_at', 'created_at'],
    valid.map((x, k) => [CENTRE_ID, x.id, x.student, x.amount, x.method, 'paid', `R-${x.paidAt.slice(2, 4)}${x.paidAt.slice(5, 7)}-${String(k + 1).padStart(6, '0')}`, x.paidAt, x.paidAt]));
  await insertMany(tx, 'payment_txns', ['centre_id', 'id', 'payment_id', 'provider', 'provider_txn_id', 'state', 'amount', 'created_at', 'performed_at'],
    valid.filter((x) => x.method === 'payme' || x.method === 'click' || x.method === 'uzum').map((x) => [CENTRE_ID, id(`txn:${x.id}`), x.id, x.method, `sbx-${fnv1a(x.id).toString(16)}`, 2, x.amount, x.paidAt, x.paidAt]));
  await tx.query('update centres set receipt_seq = $2 where id = $1', [CENTRE_ID, valid.length]);
  return { attendance: attRows.length, invoices: invRows.length, payments: valid.length };
}
