/** Builds the API on a seeded database: PGlite always, plus real PostgreSQL when TEST_DATABASE_URL is set. */
import { LocalTestGenerator, signInitData, type TelegramUser } from '@ustoz/core';
import { createBackend, migrate, type Database } from '@ustoz/db';
import { createPgliteDatabase } from '@ustoz/db/pglite';
import { createPaymentsPort, SANDBOX_CONFIG } from '@ustoz/payments';
import { DEMO_CERT_SECRET, seedDemo } from '@ustoz/seed';
import { buildApp } from '../src';

export const BOT_TOKEN = '123456789:TEST_ONLY_token_for_api_tests_xxxxxxxx';
export const JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef';
export const WEBHOOK_SECRET = 'test_only_webhook_secret';

export const ADAPTERS: Array<{ name: string; make: () => Promise<Database> }> = [{ name: 'pglite', make: () => createPgliteDatabase() }];
if (process.env.TEST_DATABASE_URL) {
  ADAPTERS.push({
    name: 'postgres',
    make: async () => {
      const { createPgDatabase } = await import('@ustoz/db/pg');
      const db = createPgDatabase(process.env.TEST_DATABASE_URL!, 4);
      await db.exec('drop schema if exists public cascade; create schema public; grant all on schema public to public;');
      return db;
    },
  });
}

export async function makeApi(make: () => Promise<Database>, opts: { limits?: Record<string, number>; bot?: Parameters<typeof buildApp>[0]['bot'] } = {}) {
  const db = await make();
  await migrate(db);
  let now = new Date('2026-11-18T07:00:00Z');
  await seedDemo(db, { now });
  const backend = createBackend({ db, clock: { now: () => now }, certSecret: DEMO_CERT_SECRET, verifyBase: 'https://example.test/#/verify/', testGenerator: new LocalTestGenerator(), payments: createPaymentsPort(SANDBOX_CONFIG) });
  const app = await buildApp({
    backend,
    bot: opts.bot ?? null,
    config: { botToken: BOT_TOKEN, botWebhookSecret: WEBHOOK_SECRET, jwtSecret: JWT_SECRET, corsOrigins: ['https://app.example.test'], initDataMaxAgeSec: 3600, nodeEnv: 'test', providers: SANDBOX_CONFIG, limits: opts.limits },
  });
  const login = async (user: TelegramUser, role?: string) => {
    const initData = await signInitData({ user, authDate: now }, BOT_TOKEN);
    const r = await app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData, ...(role ? { role } : {}) } });
    return r.json() as { token: string; role: string };
  };
  const call = async (token: string | null, method: string, payload: unknown = {}) =>
    app.inject({ method: 'POST', url: `/v1/${method}`, payload: payload as Record<string, unknown>, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { app, backend, db, login, call, setNow: (d: Date) => (now = d), close: async () => { await app.close(); await db.close(); } };
}
