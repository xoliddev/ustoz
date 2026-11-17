/**
 * @ustoz/db — schema, migrations and the application services shared by the Fastify API (node-postgres)
 * and the GitHub Pages demo (PGlite in a Web Worker). One backend, two drivers.
 */
import { monthOf, type Role, type TelegramUser } from '@ustoz/core';
import { attendanceService } from './services/attendance';
import { billingService } from './services/billing';
import { runMonth } from './services/billing-core';
import { Ctx, SYSTEM, type Actor, type BackendDeps } from './services/ctx';
import { groupsService } from './services/groups';
import { insightsService } from './services/insights';
import { learningService } from './services/learning';
import { leadsService } from './services/leads';
import { sqlLedger } from './services/ledger';
import { actorFor, loadUser, orgService, upsertTelegramUser, type Membership, type UserRow } from './services/org';
import { payrollService } from './services/payroll';
import { studentsService } from './services/students';
import { testsService } from './services/tests';

export * from './client';
export type { Actor, BackendDeps, Locale, Member, PaymentsPort } from './services/ctx';
export { ANON, SYSTEM, Ctx } from './services/ctx';
export type { Membership, UserRow } from './services/org';
export type { Ledger, Txn, Provider, PaymentInfo } from './services/ledger';
export type { GroupRow, GroupInput } from './services/groups';
export type { StudentListRow } from './services/students';
export type { LeadRow } from './services/leads';
export type { Receipt } from './services/billing';
export type { PayrollRow } from './services/payroll';
export { sqlLedger };
export { computeInvoice } from './services/billing-core';

export function createBackend(deps: BackendDeps) {
  const ctx = new Ctx(deps);
  const methods = {
    ...orgService(ctx),
    ...groupsService(ctx),
    ...studentsService(ctx),
    ...attendanceService(ctx),
    ...leadsService(ctx),
    ...billingService(ctx),
    ...payrollService(ctx),
    ...learningService(ctx),
    ...testsService(ctx),
    ...insightsService(ctx),
  };
  const ledger = sqlLedger(ctx);
  return {
    ctx,
    methods,
    ledger,
    /** Upserts the (already verified) Telegram user and resolves their memberships. */
    async signIn(u: TelegramUser, want?: { centreId?: string; role?: Role }): Promise<{ user: UserRow; memberships: Membership[]; actor: Actor }> {
      const { user, memberships } = await upsertTelegramUser(ctx, u);
      return { user, memberships, actor: actorFor(user, memberships, want) };
    },
    /** Re-resolves an actor for a user id (token refresh, role switch). */
    async actorForUser(userId: string, want?: { centreId?: string; role?: Role }): Promise<Actor> {
      const { user, memberships } = await loadUser(ctx, userId);
      return actorFor(user, memberships, want);
    },
    /** Links a Telegram user to student/parent/teacher records by the phone they shared with the bot. */
    async claimByPhone(userId: string, telegramId: number, phone: string): Promise<number> {
      const [r] = await ctx.tx(null, { ...SYSTEM, userId }, (tx) => tx.query<{ n: number }>('select claim_by_phone($1, $2, $3) as n', [phone, userId, telegramId]));
      return r?.n ?? 0;
    },
    /** Scheduled job: bill the current month for every centre (idempotent; run daily). */
    async runMonthlyBilling(): Promise<number> {
      const month = monthOf(ctx.today());
      const centres = await ctx.tx(null, SYSTEM, (tx) => tx.query<{ c: string }>('select job_centres() as c'));
      let created = 0;
      for (const { c } of centres) created += (await ctx.tx(c, SYSTEM, (tx) => runMonth(tx, c, month, ctx.now()))).created;
      return created;
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export type Methods = Backend['methods'];
export type MethodName = keyof Methods;
export type MethodInput<K extends MethodName> = Parameters<Methods[K]>[1];
export type MethodOutput<K extends MethodName> = Awaited<ReturnType<Methods[K]>>;
