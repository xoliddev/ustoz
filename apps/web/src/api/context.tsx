/**
 * React glue: the ApiClient in context, a data hook that refetches whenever anything changed (a write, a
 * bot message, an outbox notification) — so the admin panel, the phone and the bot chat stay in sync — and
 * the demo's role/persona state.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Input, Output, RouteName } from '@ustoz/contract';
import type { Role } from '@ustoz/core';
import type { ApiClient, BackendStatus } from './types';

const ApiCtx = createContext<ApiClient | null>(null);
const VersionCtx = createContext(0);
const RoleCtx = createContext<{ role: Role; setRole(r: Role): void }>({ role: 'director', setRole: () => undefined });

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => client.onEvent(() => setVersion((v) => v + 1)), [client]);
  return (
    <ApiCtx.Provider value={client}>
      <VersionCtx.Provider value={version}>{children}</VersionCtx.Provider>
    </ApiCtx.Provider>
  );
}

export function useApi(): ApiClient {
  const c = useContext(ApiCtx);
  if (!c) throw new Error('ApiProvider missing');
  return c;
}

export function useStatus(): BackendStatus {
  const c = useApi();
  return useSyncExternalStore(c.subscribe, c.status, c.status);
}

export const useVersion = () => useContext(VersionCtx);

export function RoleProvider({ role, setRole, children }: { role: Role; setRole(r: Role): void; children: ReactNode }) {
  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}
export const useRole = () => useContext(RoleCtx);

export interface DataState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload(): void;
}

/** Fetches `name(input)` as persona `as`; refetches when the input, the persona or the data version change. */
export function useData<K extends RouteName>(as: Role, name: K, input: Input<K> | null): DataState<Output<K>> {
  const api = useApi();
  const version = useVersion();
  const key = input === null ? null : JSON.stringify(input);
  const [state, setState] = useState<{ data?: Output<K>; error: Error | null; loading: boolean; key?: string }>({ error: null, loading: true });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (key === null) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: s.key === `${as}|${name}|${key}` ? s.error : null }));
    api.call(as, name, JSON.parse(key) as Input<K>).then(
      (data) => my === seq.current && setState({ data, error: null, loading: false, key: `${as}|${name}|${key}` }),
      (error: Error) => my === seq.current && setState((s) => ({ ...s, error, loading: false })),
    );
  }, [api, as, name, key, version, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const fresh = state.key === `${as}|${name}|${key}`;
  return { data: fresh ? state.data : undefined, error: state.error, loading: state.loading || !fresh, reload };
}

/** Calls a write method with a busy flag; errors surface through the returned promise. */
export function useAction() {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <K extends RouteName>(as: Role, name: K, input: Input<K>): Promise<Output<K>> => {
      setBusy(true);
      try {
        return await api.call(as, name, input);
      } finally {
        setBusy(false);
      }
    },
    [api],
  );
  return { run, busy };
}
