/** LocalApi (forwards to the PGlite worker) and HttpApi (talks to the Fastify API with a bearer token). */
import { ROUTES, type RouteName } from '@ustoz/contract';
import { ClientError, toClientError, type ApiClient, type ApiEvent, type BackendStatus } from './types';
import type { FromWorker, ToWorker } from './worker';

type Msg = ToWorker extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;
const isWrite = (name: RouteName) => ROUTES[name].rate === 'write';

export function createLocalApi(): ApiClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'ustoz-backend' });
  let seq = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  let status: BackendStatus = { phase: 'booting', progress: 0 };
  const listeners = new Set<() => void>();
  const events = new Set<(e: ApiEvent) => void>();
  const emit = (e: ApiEvent) => events.forEach((fn) => fn(e));

  worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'result') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.ok) p?.resolve(m.value);
      else p?.reject(toClientError(m.error));
    } else if (m.type === 'status') {
      status = m.status;
      listeners.forEach((fn) => fn());
    } else emit({ type: 'outbox' });
  });
  worker.addEventListener('error', (e) => {
    status = { ...status, phase: 'error', error: e.message || 'Worker failed to start' };
    listeners.forEach((fn) => fn());
  });

  const send = (msg: Msg) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id } as ToWorker);
    });

  return {
    kind: 'local',
    async call(as, name, input) {
      const out = await send({ type: 'call', as, name, input });
      if (isWrite(name)) emit({ type: 'changed' });
      return out as never;
    },
    status: () => status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onEvent(fn) {
      events.add(fn);
      return () => events.delete(fn);
    },
    async bot(as, input) {
      const r = await send({ type: 'bot', as, input });
      emit({ type: 'changed' });
      return r as never;
    },
    async sandboxPay(provider, paymentId, amount) {
      const r = await send({ type: 'pay', provider, paymentId, amount });
      emit({ type: 'changed' });
      return r as never;
    },
    async reset() {
      await send({ type: 'reset' });
      emit({ type: 'changed' });
    },
  };
}

/** Real server: token from /v1/auth/telegram (Telegram Mini App initData). */
export function createHttpApi(base: string, getToken: () => string | null): ApiClient {
  const events = new Set<(e: ApiEvent) => void>();
  const status: BackendStatus = { phase: 'ready', progress: 1 };
  return {
    kind: 'http',
    async call(_as, name, input) {
      const token = getToken();
      const res = await fetch(`${base}/v1/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(input ?? {}),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; details?: Record<string, unknown> } };
      if (!res.ok) throw new ClientError(body.error?.code ?? 'INTERNAL', body.error?.message ?? res.statusText, body.error?.details);
      if (isWrite(name)) events.forEach((fn) => fn({ type: 'changed' }));
      return body as never;
    },
    status: () => status,
    subscribe: () => () => undefined,
    onEvent(fn) {
      events.add(fn);
      return () => events.delete(fn);
    },
  };
}
