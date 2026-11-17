/**
 * Monthly tuition. A group's fee is for the month's lessons, so joining mid-month is prorated by lessons,
 * not days: the fee is split across the month's lesson dates with `allocate` (exact integer shares that add
 * up to the fee) and the student pays the shares of the lessons they can attend. Two halves of a month
 * therefore always add up to the full fee, to the tiyin.
 *
 * Discounts apply in order on the running amount (sibling → prepaid → custom) and never go below zero.
 */
import { datesOn, maxDate, minDate, monthEnd, monthStart, type IsoDate, type Month } from './dates';
import { allocate, percentOf, type Tiyin } from './money';

export interface EnrollmentTerms {
  monthlyFee: Tiyin;
  /** ISO weekdays the group meets on. */
  days: readonly number[];
  joinedOn: IsoDate;
  leftOn?: IsoDate | null;
  groupStartsOn: IsoDate;
  groupEndsOn?: IsoDate | null;
}

export type DiscountKind = 'sibling' | 'prepaid' | 'custom';
export interface Discount {
  kind: DiscountKind;
  /** basis points (1000 = 10%) */
  bp?: number;
  fixed?: Tiyin;
}
export interface DiscountLine {
  kind: DiscountKind;
  amount: Tiyin;
  bp?: number;
}

export interface InvoiceCalc {
  month: Month;
  lessonsInMonth: number;
  lessonsBilled: number;
  base: Tiyin;
  prorated: Tiyin;
  discounts: DiscountLine[];
  total: Tiyin;
}

const ORDER: Record<DiscountKind, number> = { sibling: 0, prepaid: 1, custom: 2 };

export function lessonShares(fee: Tiyin, days: readonly number[], month: Month): Array<{ date: IsoDate; share: Tiyin }> {
  const dates = datesOn(days, monthStart(month), monthEnd(month));
  // whole-so'm shares when the fee is in whole so'm (receipts stay free of tiyin), still summing exactly to the fee
  const unit = fee % 100 === 0 ? 100 : 1;
  const shares = allocate(fee / unit, dates.map(() => 1)).map((x) => x * unit);
  return dates.map((date, i) => ({ date, share: shares[i]! }));
}

export function applyDiscounts(amount: Tiyin, discounts: readonly Discount[]): { lines: DiscountLine[]; total: Tiyin } {
  let running = amount;
  const lines: DiscountLine[] = [];
  for (const d of [...discounts].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) {
    const bp = Math.min(10_000, Math.max(0, d.bp ?? 0));
    // percentage discounts round to whole so'm when the amount is in whole so'm
    const raw = d.bp ? (running % 100 === 0 ? percentOf(running / 100, bp) * 100 : percentOf(running, bp)) : Math.max(0, d.fixed ?? 0);
    const cut = Math.min(running, raw);
    if (cut <= 0) continue;
    running -= cut;
    lines.push({ kind: d.kind, amount: cut, ...(d.bp ? { bp: d.bp } : {}) });
  }
  return { lines, total: running };
}

export function invoiceFor(t: EnrollmentTerms, month: Month, discounts: readonly Discount[] = []): InvoiceCalc {
  const shares = lessonShares(t.monthlyFee, t.days, month);
  const from = maxDate(t.joinedOn, t.groupStartsOn);
  const until = minDate(t.leftOn ?? '9999-12-31', t.groupEndsOn ?? '9999-12-31');
  const billed = shares.filter((s) => s.date >= from && s.date <= until);
  const prorated = billed.reduce((s, x) => s + x.share, 0);
  const { lines, total } = applyDiscounts(prorated, discounts);
  return { month, lessonsInMonth: shares.length, lessonsBilled: billed.length, base: t.monthlyFee, prorated, discounts: lines, total };
}

/** Prepaying several months: 3+ months −5%, 6+ months −10% (configurable). */
export const PREPAID_TIERS: ReadonlyArray<{ months: number; bp: number }> = [
  { months: 6, bp: 1000 },
  { months: 3, bp: 500 },
];
export const prepaidBp = (months: number, tiers = PREPAID_TIERS): number => tiers.find((t) => months >= t.months)?.bp ?? 0;

export const SIBLING_BP = 1000;

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid';
export interface InvoiceLike {
  id: string;
  month: Month;
  total: Tiyin;
}

/**
 * Applies a student's payments to invoices oldest-first. Returns each invoice's paid amount and status,
 * the outstanding debt and any credit left over (overpayment carried forward).
 */
export function settle<T extends InvoiceLike>(invoices: readonly T[], paidTotal: Tiyin): { rows: Array<T & { paid: Tiyin; status: InvoiceStatus }>; debt: Tiyin; credit: Tiyin } {
  let left = paidTotal;
  const rows = [...invoices]
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.id < b.id ? -1 : 1))
    .map((inv) => {
      const paid = Math.min(left, inv.total);
      left -= paid;
      const status: InvoiceStatus = paid >= inv.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      return { ...inv, paid, status };
    });
  const due = invoices.reduce((s, i) => s + i.total, 0);
  return { rows, debt: Math.max(0, due - paidTotal), credit: Math.max(0, paidTotal - due) };
}

/** Day of the month by which an invoice must be paid. */
export const DUE_DAY = 10;
export const dueDateOf = (month: Month): IsoDate => `${month}-${String(DUE_DAY).padStart(2, '0')}`;
