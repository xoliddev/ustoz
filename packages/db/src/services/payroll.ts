/** Monthly payroll: each teacher's payslip from their rule and their groups' billed/collected fees. */
import { computePayslip, datesOn, maxDate, minDate, monthEnd, monthStart, settle, type Month, type Payslip, type SalaryScheme } from '@ustoz/core';
import type { Sql } from '../client';
import type { Actor, Ctx } from './ctx';

export interface PayrollRow {
  teacherId: string;
  fullName: string;
  rule: { scheme: SalaryScheme; amount: number; bp: number };
  payslip: Payslip;
}

/** Paid amount of every invoice, applying each student's payments oldest-invoice-first. */
async function paidByInvoice(tx: Sql, studentIds: string[]): Promise<Map<string, number>> {
  if (!studentIds.length) return new Map();
  const inv = await tx.query<{ id: string; studentId: string; month: string; total: number }>('select id, student_id, month, total from invoices where student_id = any($1::uuid[])', [studentIds]);
  const paid = await tx.query<{ studentId: string; amount: number }>(`select student_id, sum(amount)::bigint as amount from payments where status = 'paid' and student_id = any($1::uuid[]) group by student_id`, [studentIds]);
  const paidMap = new Map(paid.map((p) => [p.studentId, p.amount]));
  const out = new Map<string, number>();
  for (const sid of studentIds) {
    const rows = settle(inv.filter((x) => x.studentId === sid), paidMap.get(sid) ?? 0).rows;
    for (const r of rows) out.set(r.id, r.paid);
  }
  return out;
}

export async function payroll(tx: Sql, month: Month, teacherId?: string | null): Promise<PayrollRow[]> {
  const teachers = await tx.query<{ id: string; fullName: string; salaryScheme: SalaryScheme; salaryAmount: number; salaryBp: number }>(
    `select id, full_name, salary_scheme, salary_amount, salary_bp from teachers where active and ($1::uuid is null or id = $1) order by full_name`, [teacherId ?? null]);
  const groups = await tx.query<{ id: string; name: string; teacherId: string; days: number[]; startsOn: string; endsOn: string | null }>(
    `select id, name, teacher_id, days, starts_on, ends_on from groups where teacher_id is not null and starts_on <= $2::date and (ends_on is null or ends_on >= $1::date)`,
    [monthStart(month), monthEnd(month)],
  );
  const invoices = await tx.query<{ id: string; groupId: string; studentId: string; total: number }>('select id, group_id, student_id, total from invoices where month = $1', [month]);
  const paid = await paidByInvoice(tx, [...new Set(invoices.map((i) => i.studentId))]);
  return teachers.map((t) => {
    const stats = {
      groups: groups
        .filter((g) => g.teacherId === t.id)
        .map((g) => {
          const gi = invoices.filter((i) => i.groupId === g.id);
          const lessons = datesOn(g.days, maxDate(monthStart(month), g.startsOn), minDate(monthEnd(month), g.endsOn ?? '9999-12-31')).length;
          return { groupId: g.id, name: g.name, students: new Set(gi.map((i) => i.studentId)).size, billed: gi.reduce((s, i) => s + i.total, 0), collected: gi.reduce((s, i) => s + (paid.get(i.id) ?? 0), 0), lessons };
        }),
    };
    const rule = { scheme: t.salaryScheme, amount: t.salaryAmount, bp: t.salaryBp };
    return { teacherId: t.id, fullName: t.fullName, rule, payslip: computePayslip(rule, stats) };
  });
}

export function payrollService(ctx: Ctx) {
  return {
    async 'payroll.report'(a: Actor, i: { month: Month }) {
      return ctx.as(a, 'payroll.read', async (tx) => {
        const rows = await payroll(tx, i.month);
        return { month: i.month, rows, total: rows.reduce((s, r) => s + r.payslip.total, 0), collected: rows.reduce((s, r) => s + r.payslip.collected, 0) };
      });
    },
    async 'payroll.mine'(a: Actor, i: { month: Month }) {
      return ctx.as(a, 'payroll.own', async (tx, m) => {
        const [row] = await payroll(tx, i.month, m.personId);
        return row ?? null;
      });
    },
  };
}
