/** Invoice generation shared by enrolment, the monthly billing run and prepayment. */
import { addMonths, invoiceFor, monthEnd, monthStart, SIBLING_BP, uuidv7, type Discount, type Month } from '@ustoz/core';
import { json, type Sql } from '../client';

export interface InvoiceRow {
  id: string;
  month: Month;
  studentId: string;
  groupId: string;
  base: number;
  prorated: number;
  total: number;
  discounts: Array<{ kind: string; amount: number; bp?: number }>;
  lessonsBilled: number;
  lessonsInMonth: number;
}

/**
 * Computes and stores one enrolment's invoice for a month. Idempotent (unique per enrolment+month);
 * `replace` recomputes an existing one (used when a student leaves mid-month or prepays).
 * Returns null when the student has no lessons that month.
 */
export async function computeInvoice(tx: Sql, enrollmentId: string, month: Month, extraPlan?: { fromMonth: string; months: number; bp: number }) {
  const [e] = await tx.query<{ studentId: string; groupId: string; joinedOn: string; leftOn: string | null; customBp: number; days: number[]; startsOn: string; endsOn: string | null; monthlyFee: number; siblingBp: number | null; hasOlderSibling: boolean }>(
    `select e.student_id, e.group_id, e.joined_on, e.left_on, e.custom_bp, g.days, g.starts_on, g.ends_on, g.monthly_fee,
            (c.settings->>'siblingBp')::int as sibling_bp,
            exists (select 1 from student_parents sp1 join student_parents sp2 on sp2.parent_id = sp1.parent_id and sp2.student_id <> sp1.student_id
                    join enrollments e2 on e2.student_id = sp2.student_id
                    where sp1.student_id = e.student_id and e2.joined_on <= $2::date and (e2.left_on is null or e2.left_on >= $3::date)
                      and (e2.joined_on, e2.student_id) < (e.joined_on, e.student_id)) as has_older_sibling
     from enrollments e join groups g on g.id = e.group_id join centres c on c.id = e.centre_id where e.id = $1`,
    [enrollmentId, monthEnd(month), monthStart(month)],
  );
  if (!e) return null;
  const plans = await tx.query<{ fromMonth: string; months: number; bp: number }>('select from_month, months, bp from prepaid_plans where enrollment_id = $1', [enrollmentId]);
  if (extraPlan) plans.unshift(extraPlan);
  const discounts: Discount[] = [];
  if (e.hasOlderSibling) discounts.push({ kind: 'sibling', bp: e.siblingBp ?? SIBLING_BP });
  const plan = plans.find((p) => month >= p.fromMonth && month <= addMonths(p.fromMonth, p.months - 1));
  if (plan && plan.bp > 0) discounts.push({ kind: 'prepaid', bp: plan.bp });
  if (e.customBp > 0) discounts.push({ kind: 'custom', bp: e.customBp });
  const calc = invoiceFor({ monthlyFee: e.monthlyFee, days: e.days, joinedOn: e.joinedOn, leftOn: e.leftOn, groupStartsOn: e.startsOn, groupEndsOn: e.endsOn }, month, discounts);
  return { e, calc };
}

export async function billEnrollment(tx: Sql, centreId: string, enrollmentId: string, month: Month, now: Date, opts: { replace?: boolean } = {}): Promise<InvoiceRow | null> {
  const c = await computeInvoice(tx, enrollmentId, month);
  if (!c) return null;
  const { e, calc } = c;
  if (calc.lessonsBilled === 0) {
    if (opts.replace) await tx.query('delete from invoices where enrollment_id = $1 and month = $2', [enrollmentId, month]);
    return null;
  }
  const [row] = await tx.query<InvoiceRow>(
    `insert into invoices (centre_id, id, enrollment_id, student_id, group_id, month, base, prorated, discounts, total, lessons_billed, lessons_in_month, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
     on conflict (enrollment_id, month) do ${opts.replace ? `update set base = excluded.base, prorated = excluded.prorated, discounts = excluded.discounts,
       total = excluded.total, lessons_billed = excluded.lessons_billed, lessons_in_month = excluded.lessons_in_month` : 'nothing'}
     returning id, month, student_id, group_id, base, prorated, total, discounts, lessons_billed, lessons_in_month`,
    [centreId, uuidv7(now.getTime()), enrollmentId, e.studentId, e.groupId, month, calc.base, calc.prorated, json(calc.discounts), calc.total, calc.lessonsBilled, calc.lessonsInMonth, now.toISOString()],
  );
  if (row) return row;
  const [existing] = await tx.query<InvoiceRow>('select id, month, student_id, group_id, base, prorated, total, discounts, lessons_billed, lessons_in_month from invoices where enrollment_id = $1 and month = $2', [enrollmentId, month]);
  return existing ?? null;
}

/** Bills every enrolment active in `month` (idempotent). Returns how many invoices were created. */
export async function runMonth(tx: Sql, centreId: string, month: Month, now: Date): Promise<{ created: number; total: number }> {
  const before = await tx.query<{ n: number }>('select count(*)::int as n from invoices where month = $1', [month]);
  const rows = await tx.query<{ id: string }>(
    `select e.id from enrollments e join groups g on g.id = e.group_id
     where e.joined_on <= $2::date and (e.left_on is null or e.left_on >= $1::date) and g.starts_on <= $2::date and (g.ends_on is null or g.ends_on >= $1::date)
     order by e.joined_on, e.id`,
    [monthStart(month), monthEnd(month)],
  );
  for (const r of rows) await billEnrollment(tx, centreId, r.id, month, now);
  const after = await tx.query<{ n: number; total: number }>('select count(*)::int as n, coalesce(sum(total), 0)::bigint as total from invoices where month = $1', [month]);
  return { created: after[0]!.n - before[0]!.n, total: after[0]!.total };
}

/** Balance figures for a set of students: invoiced, paid, debt and the overdue part of the debt. */
export async function balances(tx: Sql, studentIds: string[] | null, today: string): Promise<Map<string, { invoiced: number; paid: number; debt: number; overdue: number; credit: number }>> {
  const rows = await tx.query<{ studentId: string; invoiced: number; due: number; paid: number }>(
    `select s.id as student_id,
            coalesce((select sum(total) from invoices i where i.student_id = s.id), 0)::bigint as invoiced,
            coalesce((select sum(total) from invoices i where i.student_id = s.id and (i.month || '-' || coalesce(c.settings->>'dueDay', '10'))::date < $2::date), 0)::bigint as due,
            coalesce((select sum(amount) from payments p where p.student_id = s.id and p.status = 'paid'), 0)::bigint as paid
     from students s join centres c on c.id = s.centre_id where ($1::uuid[] is null or s.id = any($1::uuid[]))`,
    [studentIds, today],
  );
  return new Map(rows.map((r) => [r.studentId, { invoiced: r.invoiced, paid: r.paid, debt: Math.max(0, r.invoiced - r.paid), overdue: Math.max(0, r.due - r.paid), credit: Math.max(0, r.paid - r.invoiced) }]));
}
