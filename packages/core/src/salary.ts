/**
 * Teacher pay. Three schemes a centre can mix per teacher:
 *   fixed        — a flat monthly amount
 *   per_student  — an amount for every student billed in the teacher's groups that month
 *   percent      — a share (basis points) of the fees actually collected for those groups' invoices
 * All amounts are tiyin; the percentage goes through BigInt (`percentOf`), so a payroll never drifts.
 */
import { percentOf, type Tiyin } from './money';

export type SalaryScheme = 'fixed' | 'per_student' | 'percent';

export interface SalaryRule {
  scheme: SalaryScheme;
  /** fixed: monthly amount; per_student: amount per student */
  amount: Tiyin;
  /** percent: basis points of collected fees */
  bp: number;
}

export interface TeacherMonthStats {
  groups: Array<{ groupId: string; name: string; students: number; billed: Tiyin; collected: Tiyin; lessons: number }>;
}

export interface PayLine {
  groupId: string | null;
  label: string;
  basis: Tiyin | number;
  amount: Tiyin;
}

export interface Payslip {
  scheme: SalaryScheme;
  lines: PayLine[];
  total: Tiyin;
  students: number;
  billed: Tiyin;
  collected: Tiyin;
}

export function computePayslip(rule: SalaryRule, stats: TeacherMonthStats): Payslip {
  const students = stats.groups.reduce((s, g) => s + g.students, 0);
  const billed = stats.groups.reduce((s, g) => s + g.billed, 0);
  const collected = stats.groups.reduce((s, g) => s + g.collected, 0);
  let lines: PayLine[];
  switch (rule.scheme) {
    case 'fixed':
      lines = [{ groupId: null, label: 'fixed', basis: rule.amount, amount: rule.amount }];
      break;
    case 'per_student':
      lines = stats.groups.map((g) => ({ groupId: g.groupId, label: g.name, basis: g.students, amount: g.students * rule.amount }));
      break;
    case 'percent':
      lines = stats.groups.map((g) => ({ groupId: g.groupId, label: g.name, basis: g.collected, amount: percentOf(g.collected, rule.bp) }));
      break;
  }
  return { scheme: rule.scheme, lines, total: lines.reduce((s, l) => s + l.amount, 0), students, billed, collected };
}
