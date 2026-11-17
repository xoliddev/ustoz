/**
 * The demo's in-browser backend: PGlite (Postgres compiled to WASM) loaded from the pre-baked snapshot, the
 * same SQL migrations and RLS as production, the same @ustoz/db services, the real bot engine and the real
 * payment adapters in sandbox — inside a Web Worker so the UI never blocks on SQL.
 * Sign-in is real too: each persona's initData is HMAC-signed with the demo bot token and verified.
 */
import { backendBotDeps, handleUpdate, type BotInput } from '@ustoz/botkit';
import { ApiError, ROUTES, validate, type RouteName } from '@ustoz/contract';
import { isDomainError, LocalTestGenerator, signInitData, systemClock, validateInitData, type Role } from '@ustoz/core';
import { createBackend, migrate, type Actor, type Backend } from '@ustoz/db';
import { createPglite, createPgliteDatabase, wrapPglite } from '@ustoz/db/pglite';
import { createPaymentsPort, playSandboxPayment, SANDBOX_CONFIG } from '@ustoz/payments';
import { CENTRE, DEMO_BOT_TOKEN, DEMO_CERT_SECRET, PERSONAS, seedStaticData, seedTimeline } from '@ustoz/seed';
import type { BackendStatus, SerializedError } from './types';
import initdbWasmUrl from '@electric-sql/pglite/initdb.wasm?url';
import pgliteDataUrl from '@electric-sql/pglite/pglite.data?url';
import pgliteWasmUrl from '@electric-sql/pglite/pglite.wasm?url';

export type ToWorker =
  | { id: number; type: 'call'; as: Role; name: RouteName; input: unknown }
  | { id: number; type: 'bot'; as: Role; input: BotInput }
  | { id: number; type: 'pay'; provider: 'payme' | 'click' | 'uzum'; paymentId: string; amount: number }
  | { id: number; type: 'reset' };

export type FromWorker =
  | { type: 'result'; id: number; ok: true; value: unknown }
  | { type: 'result'; id: number; ok: false; error: SerializedError }
  | { type: 'status'; status: BackendStatus }
  | { type: 'outbox' };

const scope = self as unknown as { postMessage(m: FromWorker): void; addEventListener(t: 'message', fn: (e: MessageEvent<ToWorker>) => void): void; location: Location };
const post = (m: FromWorker) => scope.postMessage(m);
let status: BackendStatus = { phase: 'booting', progress: 0 };
const setStatus = (s: Partial<BackendStatus>) => {
  status = { ...status, ...s };
  post({ type: 'status', status });
};

interface Live {
  backend: Backend;
  actors: Record<Role, Actor>;
  close(): Promise<void>;
}

async function snapshot(): Promise<Blob | null> {
  try {
    const res = await fetch(new URL(`${import.meta.env.BASE_URL}demo/snapshot.tar.gz`, scope.location.origin));
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const gzip = buf[0] === 0x1f && buf[1] === 0x8b; // a server that sets Content-Encoding hands us the inflated tar
    return buf.length > 1024 ? new Blob([buf], { type: gzip ? 'application/x-gzip' : 'application/x-tar' }) : null;
  } catch {
    return null;
  }
}

/** PGlite's WASM modules and file bundle, fetched up front (PGlite would otherwise fetch them only after the snapshot). */
async function engineAssets(): Promise<{ pgliteWasmModule?: WebAssembly.Module; initdbWasmModule?: WebAssembly.Module; fsBundle?: Blob }> {
  try {
    const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
      WebAssembly.compileStreaming(fetch(pgliteWasmUrl)),
      WebAssembly.compileStreaming(fetch(initdbWasmUrl)),
      fetch(pgliteDataUrl).then((r) => r.blob()),
    ]);
    return { pgliteWasmModule, initdbWasmModule, fsBundle };
  } catch {
    return {}; // let PGlite load them itself
  }
}

async function boot(): Promise<Live> {
  const t0 = performance.now();
  try {
    setStatus({ phase: 'booting', progress: 0.1, error: undefined });
    // download the snapshot, the Postgres WASM and its file bundle in parallel instead of one after another
    const [tar, assets] = await Promise.all([snapshot(), engineAssets()]);
    setStatus({ progress: 0.45 });
    let db;
    if (tar) db = wrapPglite(await createPglite(undefined, { loadDataDir: tar, ...assets }));
    else {
      db = await createPgliteDatabase();
      await migrate(db);
      await seedStaticData(db);
    }
    await migrate(db); // applies migrations added after the snapshot was baked
    setStatus({ phase: 'seeding', progress: 0.7 });
    await seedTimeline(db, { now: new Date() });
    const backend = createBackend({
      db,
      clock: systemClock,
      certSecret: DEMO_CERT_SECRET,
      verifyBase: `${scope.location.origin}${import.meta.env.BASE_URL}#/verify/`,
      testGenerator: new LocalTestGenerator(),
      payments: createPaymentsPort(SANDBOX_CONFIG),
      onOutbox: () => post({ type: 'outbox' }),
    });
    const actors = {} as Record<Role, Actor>;
    for (const role of Object.keys(PERSONAS) as Role[]) {
      // the real login path: signed initData → HMAC + freshness check → membership
      const initData = await signInitData({ user: PERSONAS[role], authDate: new Date() }, DEMO_BOT_TOKEN);
      const v = await validateInitData(initData, DEMO_BOT_TOKEN);
      actors[role] = (await backend.signIn(v.user, { role })).actor;
    }
    setStatus({ phase: 'ready', progress: 1, bootMs: Math.round(performance.now() - t0) });
    return { backend, actors, close: () => db.close() };
  } catch (e) {
    setStatus({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

let live = boot();

function serialize(e: unknown): SerializedError {
  if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details, status: e.status };
  if (isDomainError(e)) return { code: e.code, message: e.message, details: e.details };
  return { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) };
}

async function handle(m: ToWorker): Promise<unknown> {
  if (m.type === 'reset') {
    const l = await live.catch(() => null);
    await l?.close().catch(() => undefined);
    live = boot();
    await live;
    return { ok: true };
  }
  const { backend, actors } = await live;
  if (m.type === 'call') {
    const def = ROUTES[m.name];
    if (!def) throw new ApiError('NOT_FOUND', `Unknown method ${m.name}`);
    const fn = backend.methods[m.name] as (a: Actor, i: unknown) => Promise<unknown>;
    return (await fn(actors[m.as], validate(m.name, m.input))) ?? { ok: true };
  }
  if (m.type === 'bot') {
    const deps = backendBotDeps(backend, { centreName: CENTRE.name, miniAppUrl: `${scope.location.origin}${import.meta.env.BASE_URL}` });
    return handleUpdate(deps, PERSONAS[m.as], m.input);
  }
  return playSandboxPayment(backend.ledger, SANDBOX_CONFIG, m.provider, m.paymentId, m.amount, new Date());
}

scope.addEventListener('message', (e) => {
  const m = e.data;
  handle(m).then(
    (value) => post({ type: 'result', id: m.id, ok: true, value: JSON.parse(JSON.stringify(value ?? null)) }),
    (err) => post({ type: 'result', id: m.id, ok: false, error: serialize(err) }),
  );
});

post({ type: 'status', status });
