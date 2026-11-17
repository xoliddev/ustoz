import { describe, expect, it } from 'vitest';
import { BOT, bt, esc, LOCALES, NOTIFICATION_TEMPLATES, renderNotification, WEB } from '../src';

describe('bot copy', () => {
  it('every string exists in uz, ru and en and keeps the same placeholders', () => {
    for (const [key, row] of Object.entries({ ...BOT, ...WEB })) {
      expect(row, key).toHaveLength(3);
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      for (const s of row) {
        expect(s.trim(), key).not.toBe('');
        expect(ph(s), key).toBe(ph(row[0]!));
      }
    }
  });

  it('renders every notification template in every language without leftovers', () => {
    const params = { student: 'Aziz <b>', group: 'A2', date: '2026-11-18', time: '09:00–10:30', streak: 3, amount: 50_000_000, method: 'payme', receiptNo: 'R-2611-000001', balance: 0, debt: 100_00, overdue: 50_00, title: 'Essay', due: '2026-11-20', grade: 91, feedback: 'Ajoyib', questions: 8, course: 'IELTS', level: 'B2', url: 'https://x/verify/ABC' };
    for (const l of LOCALES)
      for (const t of NOTIFICATION_TEMPLATES) {
        const s = renderNotification(t, params, l);
        expect(s, `${t}/${l}`).not.toMatch(/\{\w+\}/);
        expect(s).not.toContain('<b>Aziz <b>');
      }
    expect(renderNotification('absent', params, 'uz')).toContain('18-noyabr');
    expect(renderNotification('absent', params, 'uz')).toContain('Ketma-ket 3-dars');
    expect(renderNotification('payment_received', params, 'uz')).toContain("500 000 so'm");
  });

  it('escapes HTML', () => {
    expect(esc('<a href="x">&')).toBe('&lt;a href="x"&gt;&amp;');
    expect(bt('en', 'welcome', { name: 'X' })).toBe('Hello, <b>X</b>! Choose a section.');
  });
});
