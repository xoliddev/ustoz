/** The client-side API port. LocalApi (demo: Web Worker) and HttpApi (real server) both implement it. */
import type { BotInput, BotReply } from '@ustoz/botkit';
import type { Input, Output, RouteName } from '@ustoz/contract';
import type { Role } from '@ustoz/core';
import type { ProtocolStep } from '@ustoz/payments';

export interface BackendStatus {
  phase: 'booting' | 'seeding' | 'ready' | 'error';
  progress: number;
  error?: string;
  /** ms the in-browser backend took to become ready */
  bootMs?: number;
}

export interface SerializedError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status?: number;
}

export class ClientError extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ClientError';
  }
}

export const toClientError = (e: SerializedError) => new ClientError(e.code, e.message, e.details ?? {});

export type ApiEvent = { type: 'outbox' } | { type: 'changed' };

export interface ApiClient {
  readonly kind: 'local' | 'http';
  /** `as` picks the demo persona; the HTTP client ignores it (the token carries the role). */
  call<K extends RouteName>(as: Role, name: K, input: Input<K>): Promise<Output<K>>;
  status(): BackendStatus;
  subscribe(fn: () => void): () => void;
  onEvent(fn: (e: ApiEvent) => void): () => void;
  /** Demo only: talk to the bot as a persona (same engine as the real bot). */
  bot?(as: Role, input: BotInput): Promise<BotReply[]>;
  /** Demo only: play the payment provider's sandbox callbacks for a pending payment. */
  sandboxPay?(provider: 'payme' | 'click' | 'uzum', paymentId: string, amount: number): Promise<ProtocolStep[]>;
  reset?(): Promise<void>;
}
