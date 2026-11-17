/** IDs and deterministic randomness. */

/** UUIDv7: time-ordered, so primary-key inserts stay append-only. */
export function uuidv7(nowMs: number = Date.now()): string {
  const r = crypto.getRandomValues(new Uint8Array(10));
  const ts = nowMs.toString(16).padStart(12, '0').slice(-12);
  const hex = Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('');
  const variant = ((parseInt(hex.slice(3, 4), 16) & 0x3) | 0x8).toString(16);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hex.slice(0, 3)}-${variant}${hex.slice(4, 7)}-${hex.slice(7, 19)}`;
}

/** FNV-1a 32-bit. */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A stable UUID derived from a name (seed data, so the snapshot and tests agree on ids). */
export function stableUuid(name: string): string {
  const parts = [0x811c9dc5, 0x1234567, 0x9e3779b9, 0x7f4a7c15].map((s) => fnv1a(name, s).toString(16).padStart(8, '0'));
  const hex = parts.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** mulberry32: tiny seeded PRNG for deterministic seeds and test generation. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

export function shuffle<T>(r: () => number, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Short human code (no 0/O/1/I) for receipts and certificates. */
export function humanCode(r: () => number, len = 8): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += A[Math.floor(r() * A.length)];
  return s;
}
