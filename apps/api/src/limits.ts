/**
 * Fixed-window rate limits, keyed by group and by the verified user (or the client IP when anonymous):
 *   auth      10/min per IP          POST /v1/auth/*
 *   public    30/min per IP          certificate verification
 *   ai        10/min per user        test generation (may call a paid model)
 *   write    120/min per user        anything that changes data
 *   default  300/min per user/IP     reads
 *   webhook  600/min per IP          payment provider + Telegram callbacks
 * In memory, for a single API instance; behind a load balancer swap in a shared store (Redis).
 */
export type LimitGroup = 'auth' | 'public' | 'ai' | 'write' | 'default' | 'webhook';

export const DEFAULT_LIMITS: Record<LimitGroup, number> = { auth: 10, public: 30, ai: 10, write: 120, default: 300, webhook: 600 };
export const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly m = new Map<string, { n: number; start: number }>();
  private ops = 0;
  constructor(private readonly limits: Record<LimitGroup, number>, private readonly now: () => number = Date.now) {}

  /** Counts a hit; returns null when allowed or the seconds to wait. */
  hit(group: LimitGroup, key: string): number | null {
    const t = this.now();
    if (++this.ops % 2000 === 0) for (const [k, e] of this.m) if (e.start + WINDOW_MS <= t) this.m.delete(k);
    const id = `${group}:${key}`;
    let e = this.m.get(id);
    if (!e || e.start + WINDOW_MS <= t) {
      e = { n: 0, start: t };
      this.m.set(id, e);
    }
    e.n++;
    return e.n > this.limits[group] ? Math.max(1, Math.ceil((e.start + WINDOW_MS - t) / 1000)) : null;
  }
}
