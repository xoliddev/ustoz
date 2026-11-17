/**
 * Money is always an integer number of tiyin (1 so'm = 100 tiyin). No floats ever touch an amount:
 * percentages are integer basis points (1% = 100 bp) and every multiplication goes through BigInt,
 * so 1e13 tiyin × 10 000 bp cannot lose precision.
 */
import { DomainError } from './errors';

export type Tiyin = number;

export const MAX_TIYIN = 10_000_000_000_000; // 100 billion so'm — far above any real fee

export function assertTiyin(v: number, field = 'amount'): Tiyin {
  if (!Number.isSafeInteger(v) || v < 0 || v > MAX_TIYIN) throw new DomainError('VALIDATION', `${field} must be a non-negative integer number of tiyin`, { field });
  return v;
}

export const som = (s: number): Tiyin => Math.round(s * 100);

/** amount × num / den, rounded half-up, exact for any safe-integer inputs. */
export function mulDiv(amount: Tiyin, num: number, den: number): Tiyin {
  if (den === 0) throw new RangeError('division by zero');
  const a = BigInt(amount) * BigInt(num);
  const d = BigInt(den);
  const q = a / d;
  const r = a % d;
  const neg = (a < 0n) !== (d < 0n);
  // half-up away from zero
  const twice = (r < 0n ? -r : r) * 2n;
  const absD = d < 0n ? -d : d;
  const bump = twice >= absD ? (neg ? -1n : 1n) : 0n;
  return Number(q + bump);
}

/** Percentage given in basis points (1500 = 15%). */
export const percentOf = (amount: Tiyin, bp: number): Tiyin => mulDiv(amount, bp, 10_000);

/**
 * Splits `total` across `weights` so the parts are integers that add up to exactly `total`
 * (largest-remainder method; ties go to the earlier index). Used for per-lesson proration.
 */
export function allocate(total: Tiyin, weights: number[]): Tiyin[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const T = BigInt(total);
  const S = BigInt(sum);
  const base = weights.map((w) => (T * BigInt(w)) / S);
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % S }));
  let left = Number(T - base.reduce((s, b) => s + b, 0n));
  rem.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  const out = base.map(Number);
  for (let k = 0; left > 0; k = (k + 1) % rem.length, left--) out[rem[k]!.i]! += 1;
  return out;
}

const SEP: Record<string, string> = { uz: ' ', ru: ' ', en: ',' };
const CUR: Record<string, string> = { uz: "so'm", ru: 'сум', en: 'UZS' };

/** "1 250 000 so'm" — whole so'm unless there are tiyin. */
export function formatMoney(t: Tiyin, locale = 'uz', opts: { currency?: boolean } = {}): string {
  const neg = t < 0;
  const abs = Math.abs(t);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, SEP[locale] ?? ' ');
  const num = `${neg ? '−' : ''}${grouped}${frac ? `${locale === 'en' ? '.' : ','}${String(frac).padStart(2, '0')}` : ''}`;
  return opts.currency === false ? num : `${num} ${CUR[locale] ?? CUR.uz}`;
}

/** Compact: "12,4 mln" / "12.4M" for dashboards. */
export function formatMoneyShort(t: Tiyin, locale = 'uz'): string {
  const s = t / 100;
  const abs = Math.abs(s);
  const dec = locale === 'en' ? '.' : ',';
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', dec);
  if (abs >= 1e9) return `${fmt(s / 1e9)} ${locale === 'en' ? 'B' : locale === 'ru' ? 'млрд' : 'mlrd'}`;
  if (abs >= 1e6) return `${fmt(s / 1e6)} ${locale === 'en' ? 'M' : locale === 'ru' ? 'млн' : 'mln'}`;
  if (abs >= 1e3) return `${fmt(s / 1e3)} ${locale === 'en' ? 'K' : locale === 'ru' ? 'тыс' : 'ming'}`;
  return formatMoney(t, locale);
}

/** "1 250 000", "1250000.5", "1 250 000,50" → tiyin, parsed as a string (no float rounding). Null if invalid. */
export function parseSom(input: string): Tiyin | null {
  const s = input.replace(/[\s ']/g, '').replace(',', '.');
  const m = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
