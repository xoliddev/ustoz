import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allocate, applyDiscounts, formatMoney, invoiceFor, lessonShares, MAX_TIYIN, mulDiv, percentOf, prepaidBp, settle, som,
} from '../src';

const tiyin = fc.integer({ min: 0, max: MAX_TIYIN });

describe('money', () => {
  it('formats so\'m with grouping and tiyin', () => {
    expect(formatMoney(som(1_250_000))).toBe("1 250 000 so'm");
    expect(formatMoney(12_345, 'en')).toBe('123.45 UZS');
    expect(formatMoney(5, 'ru')).toBe('0,05 сум');
  });

  it('mulDiv rounds half-up and is exact for huge amounts', () => {
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(MAX_TIYIN, 9_999, 10_000)).toBe(9_999_000_000_000);
    expect(percentOf(333, 5000)).toBe(167);
  });

  it('allocate: parts are integers that sum to the total exactly (property)', () => {
    fc.assert(
      fc.property(tiyin, fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 40 }), (total, weights) => {
        const parts = allocate(total, weights);
        expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
        for (const p of parts) expect(Number.isSafeInteger(p) && p >= 0).toBe(true);
      }),
    );
  });

  it('percentOf never exceeds the amount and is monotonic in bp (property)', () => {
    fc.assert(
      fc.property(tiyin, fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (a, b1, b2) => {
        const [lo, hi] = b1 <= b2 ? [b1, b2] : [b2, b1];
        expect(percentOf(a, hi)).toBeLessThanOrEqual(a);
        expect(percentOf(a, lo)).toBeLessThanOrEqual(percentOf(a, hi));
      }),
    );
  });
});

describe('billing', () => {
  const terms = { monthlyFee: som(600_000), days: [1, 3, 5], joinedOn: '2026-01-01', groupStartsOn: '2026-01-01' };

  it('full month bills the whole fee', () => {
    const inv = invoiceFor(terms, '2026-11');
    expect(inv.prorated).toBe(som(600_000));
    expect(inv.lessonsBilled).toBe(inv.lessonsInMonth);
  });

  it('joining mid-month bills only the remaining lessons', () => {
    const inv = invoiceFor({ ...terms, joinedOn: '2026-11-16' }, '2026-11');
    // Nov 2026 Mon/Wed/Fri: 13 lessons, from the 16th: 16,18,20,23,25,27,30 = 7
    expect(inv.lessonsInMonth).toBe(13);
    expect(inv.lessonsBilled).toBe(7);
    expect(inv.prorated).toBe(lessonShares(som(600_000), [1, 3, 5], '2026-11').slice(6).reduce((s, x) => s + x.share, 0));
  });

  it('a month split at any day adds up to the full fee, to the tiyin (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000_00 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 2, max: 28 }),
        (fee, days, y, mo, d) => {
          const month = `${y}-${String(mo).padStart(2, '0')}`;
          const split = `${month}-${String(d).padStart(2, '0')}`;
          const prev = `${month}-${String(d - 1).padStart(2, '0')}`;
          const before = invoiceFor({ monthlyFee: fee, days, joinedOn: '2000-01-01', leftOn: prev, groupStartsOn: '2000-01-01' }, month);
          const after = invoiceFor({ monthlyFee: fee, days, joinedOn: split, groupStartsOn: '2000-01-01' }, month);
          expect(before.prorated + after.prorated).toBe(fee);
        },
      ),
    );
  });

  it('discounts apply in order, never go negative, never exceed the amount (property)', () => {
    const disc = fc.record({ kind: fc.constantFrom('sibling' as const, 'prepaid' as const, 'custom' as const), bp: fc.option(fc.integer({ min: 0, max: 12_000 }), { nil: undefined }), fixed: fc.option(tiyin, { nil: undefined }) });
    fc.assert(
      fc.property(tiyin, fc.array(disc, { maxLength: 4 }), (amount, ds) => {
        const { lines, total } = applyDiscounts(amount, ds);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total + lines.reduce((s, l) => s + l.amount, 0)).toBe(amount);
      }),
    );
  });

  it('sibling 10% then prepaid 5% compound on the running amount', () => {
    const inv = invoiceFor(terms, '2026-11', [{ kind: 'prepaid', bp: 500 }, { kind: 'sibling', bp: 1000 }]);
    expect(inv.discounts.map((d) => d.kind)).toEqual(['sibling', 'prepaid']);
    expect(inv.total).toBe(som(600_000) - som(60_000) - som(27_000));
  });

  it('prepaid tiers', () => {
    expect([1, 3, 5, 6, 12].map((m) => prepaidBp(m))).toEqual([0, 500, 500, 1000, 1000]);
  });

  it('settle pays oldest invoices first and reports debt and credit', () => {
    const inv = [
      { id: 'b', month: '2026-10', total: 500 },
      { id: 'a', month: '2026-09', total: 300 },
      { id: 'c', month: '2026-11', total: 400 },
    ];
    const r = settle(inv, 600);
    expect(r.rows.map((x) => [x.id, x.status, x.paid])).toEqual([['a', 'paid', 300], ['b', 'partial', 300], ['c', 'unpaid', 0]]);
    expect(r.debt).toBe(600);
    expect(settle(inv, 1500).credit).toBe(300);
  });

  it('settle conserves money (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e9 }), { maxLength: 12 }), fc.integer({ min: 0, max: 2e10 }), (totals, paid) => {
        const r = settle(totals.map((t, i) => ({ id: String(i).padStart(3, '0'), month: '2026-01', total: t })), paid);
        const applied = r.rows.reduce((s, x) => s + x.paid, 0);
        expect(applied + r.credit).toBe(paid);
        expect(r.debt).toBe(totals.reduce((s, t) => s + t, 0) - applied);
      }),
    );
  });
});
