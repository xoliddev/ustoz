/** Billing: monthly run, debtors, reminders, cash/card payments, prepayment, receipts and online checkout. */
import { addMonths, DomainError, dueDateOf, monthOf, prepaidBp, receiptNumber, settle, uuidv7, type IsoDate, type Month } from '@ustoz/core';
import type { Sql } from '../client';
import { balances, billEnrollment, computeInvoice, runMonth } from './billing-core';
import type { Actor, Ctx, Member } from './ctx';

export interface Receipt {
  id: string;
  receiptNo: string;
  studentName: string;
  amount: number;
  method: string;
  paidAt: string;
  centreName: string;
  note: string;
  balanceAfter: number;
}

async function nextReceipt(tx: Sql, today: IsoDate): Promise<string> {
  const [c] = await tx.query<{ seq: number }>('update centres set receipt_seq = receipt_seq + 1 where id = app_centre() returning receipt_seq as seq');
  return receiptNumber(today, c!.seq);
}

export async function receiptFor(tx: Sql, paymentId: string, today: IsoDate): Promise<Receipt> {
  const [p] = await tx.query<Omit<Receipt, 'balanceAfter'> & { studentId: string }>(
    `select p.id, p.receipt_no, s.full_name as student_name, p.amount, p.method, p.paid_at, c.name as centre_name, p.note, p.student_id
     from payments p join students s on s.id = p.student_id join centres c on c.id = p.centre_id where p.id = $1 and p.status = 'paid'`,
    [paymentId],
  );
  if (!p) throw new DomainError('NOT_FOUND', 'Payment not found');
  const b = (await balances(tx, [p.studentId], today)).get(p.studentId)!;
  const { studentId: _s, ...rest } = p;
  return { ...rest, balanceAfter: b.credit - b.debt };
}

/** Marks a payment paid, numbers its receipt and tells the family. Shared by the cashier and provider webhooks. */
export async function completePayment(ctx: Ctx, tx: Sql, centreId: string, paymentId: string): Promise<Receipt> {
  const today = ctx.today();
  const no = await nextReceipt(tx, today);
  const [p] = await tx.query<{ studentId: string; amount: number; method: string }>(
    `update payments set status = 'paid', paid_at = $2, receipt_no = coalesce(receipt_no, $3) where id = $1 and status = 'pending' returning student_id, amount, method`,
    [paymentId, ctx.now().toISOString(), no],
  );
  if (!p) throw new DomainError('CONFLICT', 'Payment is not pending');
  const receipt = await receiptFor(tx, paymentId, today);
  await ctx.notifyFamily(tx, centreId, p.studentId, 'payment_received', { amount: p.amount, method: p.method, receiptNo: receipt.receiptNo, balance: receipt.balanceAfter }, { alsoStudent: true });
  return receipt;
}

export function billingService(ctx: Ctx) {
  const invoicesOf = (tx: Sql, studentId: string) =>
    tx.query<{ id: string; month: Month; total: number; prorated: number; base: number; discounts: Array<{ kind: string; amount: number }>; groupName: string; lessonsBilled: number; lessonsInMonth: number }>(
      `select i.id, i.month, i.total, i.prorated, i.base, i.discounts, g.name as group_name, i.lessons_billed, i.lessons_in_month
       from invoices i join groups g on g.id = i.group_id where i.student_id = $1 order by i.month, i.id`,
      [studentId],
    );

  async function statement(tx: Sql, studentId: string) {
    const invoices = await invoicesOf(tx, studentId);
    const payments = await tx.query<{ id: string; amount: number; method: string; status: string; receiptNo: string | null; paidAt: string | null; createdAt: string }>(
      `select id, amount, method, status, receipt_no, paid_at, created_at from payments where student_id = $1 and status <> 'cancelled' order by coalesce(paid_at, created_at) desc`,
      [studentId],
    );
    const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const s = settle(invoices, paid);
    const overdue = s.rows.filter((r) => r.status !== 'paid' && dueDateOf(r.month) < ctx.today()).reduce((x, r) => x + r.total - r.paid, 0);
    return { invoices: s.rows, payments, debt: s.debt, credit: s.credit, overdue };
  }

  return {
    async 'billing.run'(a: Actor, i: { month: Month }) {
      return ctx.as(a, 'payments.record', async (tx, m) => {
        const r = await runMonth(tx, m.centreId, i.month, ctx.now());
        await ctx.audit(tx, m, 'billing.run', 'invoice', null, { month: i.month, ...r });
        return r;
      });
    },

    async 'billing.overview'(a: Actor, i: { month: Month }) {
      return ctx.as(a, 'billing.read', async (tx) => {
        const [t] = await tx.query<{ billed: number; invoices: number; collected: number; payments: number }>(
          `select coalesce((select sum(total) from invoices where month = $1), 0)::bigint as billed, (select count(*)::int from invoices where month = $1) as invoices,
                  coalesce((select sum(amount) from payments where status = 'paid' and to_char(paid_at at time zone 'Asia/Tashkent', 'YYYY-MM') = $1), 0)::bigint as collected,
                  (select count(*)::int from payments where status = 'paid' and to_char(paid_at at time zone 'Asia/Tashkent', 'YYYY-MM') = $1) as payments`,
          [i.month],
        );
        const recent = await tx.query<{ id: string; studentName: string; amount: number; method: string; receiptNo: string; paidAt: string }>(
          `select p.id, s.full_name as student_name, p.amount, p.method, p.receipt_no, p.paid_at from payments p join students s on s.id = p.student_id
           where p.status = 'paid' order by p.paid_at desc limit 12`,
        );
        const byMethod = await tx.query<{ method: string; amount: number }>(
          `select method, sum(amount)::bigint as amount from payments where status = 'paid' and to_char(paid_at at time zone 'Asia/Tashkent', 'YYYY-MM') = $1 group by method order by 2 desc`,
          [i.month],
        );
        return { ...t!, recent, byMethod };
      });
    },

    async 'billing.debtors'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'billing.read', async (tx) => {
        const b = await balances(tx, null, ctx.today());
        const names = await tx.query<{ id: string; fullName: string; phone: string | null; groups: string }>(
          `select s.id, s.full_name, s.phone, coalesce(string_agg(distinct g.name, ', '), '') as groups from students s
           left join enrollments e on e.student_id = s.id and e.left_on is null left join groups g on g.id = e.group_id group by s.id`,
        );
        return names
          .map((n) => ({ ...n, ...b.get(n.id)! }))
          .filter((x) => x.debt > 0)
          .sort((x, y) => y.overdue - x.overdue || y.debt - x.debt);
      });
    },

    /** Sends a payment reminder through the bot to the families of the given (or all overdue) debtors. */
    async 'billing.remind'(a: Actor, i: { studentIds?: string[] }) {
      return ctx.as(a, 'billing.remind', async (tx, m) => {
        const b = await balances(tx, i.studentIds ?? null, ctx.today());
        let messages = 0;
        let students = 0;
        for (const [studentId, x] of b) {
          if (x.debt <= 0 || (!i.studentIds && x.overdue <= 0)) continue;
          const [s] = await tx.query<{ fullName: string }>('select full_name from students where id = $1', [studentId]);
          messages += await ctx.notifyFamily(tx, m.centreId, studentId, 'payment_reminder', { student: s!.fullName, debt: x.debt, overdue: x.overdue, due: dueDateOf(monthOf(ctx.today())) });
          students++;
        }
        await ctx.audit(tx, m, 'billing.remind', 'student', null, { students, messages });
        return { students, messages };
      });
    },

    async 'payments.record'(a: Actor, i: { studentId: string; amount: number; method: 'cash' | 'card' | 'transfer'; note?: string }) {
      return ctx.as(a, 'payments.record', async (tx, m) => {
        const id = uuidv7(ctx.now().getTime());
        const [s] = await tx.query('select 1 from students where id = $1', [i.studentId]);
        if (!s) throw new DomainError('NOT_FOUND', 'Student not found');
        await tx.query(`insert into payments (centre_id, id, student_id, amount, method, status, note, created_by, created_at) values ($1,$2,$3,$4,$5,'pending',$6,$7,$8)`, [
          m.centreId, id, i.studentId, i.amount, i.method, i.note ?? '', m.userId, ctx.now().toISOString(),
        ]);
        const receipt = await completePayment(ctx, tx, m.centreId, id);
        await ctx.audit(tx, m, 'payment.record', 'payment', id, { amount: i.amount, method: i.method });
        return receipt;
      });
    },

    /** Quote for paying N months ahead (discount tier applied to every covered month). */
    async 'payments.prepayQuote'(a: Actor, i: { enrollmentId: string; months: number }) {
      return ctx.as(a, 'payments.record', async (tx) => quote(tx, i.enrollmentId, i.months));
    },

    async 'payments.prepay'(a: Actor, i: { enrollmentId: string; months: number; method: 'cash' | 'card' | 'transfer' }) {
      return ctx.as(a, 'payments.record', async (tx, m) => {
        const q = await quote(tx, i.enrollmentId, i.months);
        await tx.query('insert into prepaid_plans (centre_id, id, enrollment_id, from_month, months, bp) values ($1,$2,$3,$4,$5,$6)', [m.centreId, uuidv7(ctx.now().getTime()), i.enrollmentId, q.fromMonth, i.months, q.bp]);
        for (let k = 0; k < i.months; k++) await billEnrollment(tx, m.centreId, i.enrollmentId, addMonths(q.fromMonth, k), ctx.now(), { replace: true });
        const id = uuidv7(ctx.now().getTime());
        await tx.query(`insert into payments (centre_id, id, student_id, amount, method, status, note, created_by, created_at) values ($1,$2,$3,$4,$5,'pending',$6,$7,$8)`, [
          m.centreId, id, q.studentId, q.total, i.method, `prepaid ${i.months}`, m.userId, ctx.now().toISOString(),
        ]);
        const receipt = await completePayment(ctx, tx, m.centreId, id);
        await ctx.audit(tx, m, 'payment.prepay', 'payment', id, { months: i.months, bp: q.bp, total: q.total });
        return { ...q, receipt };
      });
    },

    async 'payments.receipt'(a: Actor, i: { paymentId: string }) {
      const perm = a.role === 'student' || a.role === 'parent' ? 'self.read' : 'billing.read';
      return ctx.as(a, perm, async (tx, m) => {
        if (perm === 'self.read') {
          const [p] = await tx.query<{ studentId: string }>('select student_id from payments where id = $1', [i.paymentId]);
          await ctx.ownStudent(tx, m, p?.studentId ?? '00000000-0000-0000-0000-000000000000');
        }
        return receiptFor(tx, i.paymentId, ctx.today());
      });
    },

    async 'billing.statement'(a: Actor, i: { studentId?: string }) {
      const self = a.role === 'student' || a.role === 'parent';
      return ctx.as(a, self ? 'self.read' : 'billing.read', async (tx, m: Member) => {
        const studentId = self ? await ctx.ownStudent(tx, m, i.studentId) : i.studentId;
        if (!studentId) throw new DomainError('VALIDATION', 'studentId required', { field: 'studentId' });
        return statement(tx, studentId);
      });
    },

    /** Student/parent starts an online payment: a pending payment the provider (sandbox) will confirm via webhook. */
    async 'payments.checkout'(a: Actor, i: { studentId?: string; amount: number; provider: 'payme' | 'click' | 'uzum' }) {
      return ctx.as(a, 'pay.online', async (tx, m) => {
        const studentId = await ctx.ownStudent(tx, m, i.studentId);
        if (!ctx.deps.payments) throw new DomainError('PAYMENT_ERROR', 'Online payments are not configured');
        const id = uuidv7(ctx.now().getTime());
        await tx.query(`insert into payments (centre_id, id, student_id, amount, method, status, created_by, created_at) values ($1,$2,$3,$4,$5,'pending',$6,$7)`, [
          m.centreId, id, studentId, i.amount, i.provider, m.userId, ctx.now().toISOString(),
        ]);
        return { paymentId: id, ...ctx.deps.payments.checkout(i.provider, { paymentId: id, amount: i.amount, centreId: m.centreId }) };
      });
    },

    async 'payments.status'(a: Actor, i: { paymentId: string }) {
      return ctx.as(a, 'pay.online', async (tx, m) => {
        const [p] = await tx.query<{ studentId: string; status: string; receiptNo: string | null; amount: number }>('select student_id, status, receipt_no, amount from payments where id = $1', [i.paymentId]);
        if (!p) throw new DomainError('NOT_FOUND', 'Payment not found');
        await ctx.ownStudent(tx, m, p.studentId);
        return { status: p.status, receiptNo: p.receiptNo, amount: p.amount };
      });
    },
  };

  /** Exact price of prepaying `months` from this month: each month priced as its invoice will be, with the tier discount. */
  async function quote(tx: Sql, enrollmentId: string, months: number) {
    const [e] = await tx.query<{ studentId: string; monthlyFee: number }>('select e.student_id, g.monthly_fee from enrollments e join groups g on g.id = e.group_id where e.id = $1 and e.left_on is null', [enrollmentId]);
    if (!e) throw new DomainError('NOT_FOUND', 'Active enrolment not found');
    const bp = prepaidBp(months);
    const fromMonth = monthOf(ctx.today());
    const lines: Array<{ month: string; prorated: number; total: number }> = [];
    for (let k = 0; k < months; k++) {
      const month = addMonths(fromMonth, k);
      const c = await computeInvoice(tx, enrollmentId, month, { fromMonth, months, bp });
      if (c && c.calc.lessonsBilled > 0) lines.push({ month, prorated: c.calc.prorated, total: c.calc.total });
    }
    const full = lines.reduce((s, l) => s + l.prorated, 0);
    const total = lines.reduce((s, l) => s + l.total, 0);
    return { studentId: e.studentId, fromMonth, months, bp, lines, full, discount: full - total, total };
  }
}
