/**
 * Payment provider adapters (Payme, Click, Uzum). They implement each provider's merchant-callback protocol
 * against our Ledger, with authentication / signature checks, exact tiyin amounts and idempotent state
 * transitions. This project ships them in SANDBOX mode only: a config that asks for anything else is refused.
 */
import { DomainError } from '@ustoz/core';
import type { Ledger, Provider } from '@ustoz/db';

export type { Ledger, Provider };

export interface PaymeConfig {
  mode: 'sandbox';
  merchantId: string;
  /** Test key from the Payme merchant cabinet (sandbox). */
  key: string;
}

export interface ClickConfig {
  mode: 'sandbox';
  serviceId: string;
  merchantId: string;
  secretKey: string;
}

export interface UzumConfig {
  mode: 'sandbox';
  serviceId: string;
  login: string;
  password: string;
}

export interface ProvidersConfig {
  payme?: PaymeConfig;
  click?: ClickConfig;
  uzum?: UzumConfig;
}

export function assertSandbox(cfg: { mode: string } | undefined, name: string): void {
  if (!cfg) throw new DomainError('PAYMENT_ERROR', `${name} is not configured`);
  if (cfg.mode !== 'sandbox') throw new DomainError('PAYMENT_ERROR', `${name}: only sandbox mode is supported in this project`);
}

/** One request/response pair, for the demo's protocol log. */
export interface ProtocolStep {
  provider: Provider;
  request: unknown;
  response: unknown;
  ok: boolean;
}

/** "1234.50" (Click sends so'm with two decimals) → 123450 tiyin, without floats. */
export function somStringToTiyin(s: string): number | null {
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const tiyinToSomString = (t: number): string => `${Math.floor(t / 100)}.${String(t % 100).padStart(2, '0')}`;
