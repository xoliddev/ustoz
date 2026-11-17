/**
 * Adapter-parity harness: every DB suite runs against PGlite and — when TEST_DATABASE_URL is set — real
 * PostgreSQL (CI runs a postgres:16 service; locally `node scripts/local-pg.mjs`).
 */
import { LocalTestGenerator, type Role } from '@ustoz/core';
import { DEMO_CERT_SECRET, PERSONAS, seedDemo } from '@ustoz/seed';
import { createBackend, migrate, type Actor, type Database } from '../src';
import { createPgliteDatabase } from '../src/pglite';

export const ADAPTERS: Array<{ name: string; make: () => Promise<Database> }> = [{ name: 'pglite', make: () => createPgliteDatabase() }];

if (process.env.TEST_DATABASE_URL) {
  ADAPTERS.push({
    name: 'postgres',
    make: async () => {
      const { createPgDatabase } = await import('../src/pg');
      const db = createPgDatabase(process.env.TEST_DATABASE_URL!, 4);
      await db.exec('drop schema if exists public cascade; create schema public; grant all on schema public to public;');
      return db;
    },
  });
}

export class TestClock {
  t: number;
  constructor(iso = '2026-11-18T07:00:00Z') {
    this.t = Date.parse(iso);
  }
  now = () => new Date(this.t);
  set(iso: string) {
    this.t = Date.parse(iso);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export async function setup(make: () => Promise<Database>, iso?: string) {
  const db = await make();
  await migrate(db);
  const clock = new TestClock(iso);
  const outbox: number[] = [];
  const be = createBackend({
    db,
    clock,
    certSecret: DEMO_CERT_SECRET,
    verifyBase: 'https://example.test/#/verify/',
    testGenerator: new LocalTestGenerator(),
    payments: { checkout: (provider, p) => ({ url: `https://sandbox.example/${provider}`, params: { amount: p.amount } }) },
    onOutbox: () => outbox.push(1),
  });
  return { db, be, m: be.methods, clock, outbox, close: () => db.close() };
}

export type H = Awaited<ReturnType<typeof setup>>;

/** Seeded demo centre + an Actor per persona role. */
export async function seeded(make: () => Promise<Database>, iso?: string) {
  const h = await setup(make, iso);
  await seedDemo(h.db, { now: h.clock.now() });
  const as = {} as Record<Role, Actor>;
  for (const role of Object.keys(PERSONAS) as Role[]) as[role] = (await h.be.signIn(PERSONAS[role], { role })).actor;
  return { ...h, as };
}

export type S = Awaited<ReturnType<typeof seeded>>;
