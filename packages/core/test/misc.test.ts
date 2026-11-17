import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addMonths, attendanceRate, can, churnRisk, computePayslip, datesOn, daysInMonth, DomainError, funnel, gradeAttempt, LocalTestGenerator, md5Hex,
  minuteOfDay, normalizePhone, requirePermission, sanitizeQuestions, signCertificate, signInitData, todayIn, validateInitData, verifyCertificate, weekday,
  weekStart, missedStreak, canMoveLead, levelFor, som,
} from '../src';

describe('dates', () => {
  it('handles month lengths, leap years and weekdays', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(weekday('2026-11-18')).toBe(3);
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });

  it('Tashkent local date flips at 19:00 UTC', () => {
    expect(todayIn(new Date('2026-11-17T18:59:00Z'))).toBe('2026-11-17');
    expect(todayIn(new Date('2026-11-17T19:00:00Z'))).toBe('2026-11-18');
    expect(minuteOfDay(new Date('2026-11-17T04:30:00Z'))).toBe(9 * 60 + 30);
  });

  it('datesOn returns only requested weekdays (property)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1 }), fc.integer({ min: 0, max: 400 }), (days, off) => {
        const from = '2026-01-01';
        const to = `2026-${String(1 + Math.floor((off % 365) / 31)).padStart(2, '0')}-28`;
        for (const d of datesOn(days, from, to)) expect(days).toContain(weekday(d));
      }),
    );
  });
});

describe('crypto', () => {
  it('md5 matches RFC 1321 vectors', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });

  it('initData: valid signature passes, tampering and staleness fail', async () => {
    const token = '123456:TEST-TOKEN';
    const now = new Date('2026-11-18T10:00:00Z');
    const data = await signInitData({ user: { id: 42, first_name: 'Aziza' }, authDate: now }, token);
    expect((await validateInitData(data, token, { now })).user.id).toBe(42);
    await expect(validateInitData(data.replace('Aziza', 'Hacker'), token, { now })).rejects.toThrow(/mismatch/);
    await expect(validateInitData(data, 'other:token', { now })).rejects.toThrow(/mismatch/);
    await expect(validateInitData(data, token, { now: new Date(now.getTime() + 2 * 86_400_000) })).rejects.toThrow(/expired/);
    await expect(validateInitData(data, token, { now: new Date(now.getTime() - 3_600_000) })).rejects.toThrow(/future/);
    await expect(validateInitData('user=%7B%7D', token, { now })).rejects.toThrow(/hash/);
  });

  it('certificate signatures detect edits', async () => {
    const f = { code: 'ABCD2345', studentName: 'Aziza K.', courseName: 'IELTS', level: 'B2', issuedOn: '2026-11-18', centreName: 'Ustoz' };
    const sig = await signCertificate('secret', f);
    expect(await verifyCertificate('secret', f, sig)).toBe(true);
    expect(await verifyCertificate('secret', { ...f, level: 'C1' }, sig)).toBe(false);
  });

  it('normalizes Uzbek phone numbers', () => {
    expect(normalizePhone('90 123 45 67')).toBe('+998901234567');
    expect(normalizePhone('+998 (93) 111-22-33')).toBe('+998931112233');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('permissions', () => {
  it('matrix', () => {
    expect(can('director', 'payroll.read')).toBe(true);
    expect(can('admin', 'payroll.read')).toBe(false);
    expect(can('teacher', 'attendance.mark')).toBe(true);
    expect(can('parent', 'homework.submit')).toBe(false);
    expect(() => requirePermission('student', 'billing.read')).toThrow(DomainError);
  });
});

describe('salary', () => {
  const stats = { groups: [{ groupId: 'g1', name: 'A', students: 10, billed: som(5_000_000), collected: som(4_000_000), lessons: 12 }, { groupId: 'g2', name: 'B', students: 7, billed: som(3_500_000), collected: som(3_333_333), lessons: 12 }] };
  it('three schemes', () => {
    expect(computePayslip({ scheme: 'fixed', amount: som(4_000_000), bp: 0 }, stats).total).toBe(som(4_000_000));
    expect(computePayslip({ scheme: 'per_student', amount: som(120_000), bp: 0 }, stats).total).toBe(17 * som(120_000));
    expect(computePayslip({ scheme: 'percent', amount: 0, bp: 4000 }, stats).total).toBe(som(1_600_000) + som(1_333_333.2));
  });
  it('percent pay never exceeds what was collected (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1e12 }), { maxLength: 8 }), fc.integer({ min: 0, max: 10_000 }), (cols, bp) => {
        const p = computePayslip({ scheme: 'percent', amount: 0, bp }, { groups: cols.map((c, i) => ({ groupId: `g${i}`, name: '', students: 1, billed: c, collected: c, lessons: 1 })) });
        expect(p.total).toBeLessThanOrEqual(p.collected);
      }),
    );
  });
});

describe('insight', () => {
  it('attendance rate ignores excused', () => {
    expect(attendanceRate(['present', 'late', 'absent', 'excused'])).toBeCloseTo(2 / 3);
    expect(attendanceRate([])).toBeNull();
  });
  it('missed streak counts back from the latest lesson', () => {
    const h = [{ date: '2026-11-02', status: 'present' as const }, { date: '2026-11-04', status: 'absent' as const }, { date: '2026-11-06', status: 'excused' as const }, { date: '2026-11-09', status: 'absent' as const }, { date: '2026-11-11', status: 'absent' as const }];
    expect(missedStreak(h)).toBe(3);
  });
  it('churn risk', () => {
    expect(churnRisk({ missedStreak: 3, overdueDebt: 0, rate: 0.9 }).level).toBe('high');
    expect(churnRisk({ missedStreak: 0, overdueDebt: 100, rate: 1 }).reasons).toEqual(['overdue_debt']);
    expect(churnRisk({ missedStreak: 1, overdueDebt: 0, rate: 0.5 }).level).toBe('watch');
    expect(churnRisk({ missedStreak: 0, overdueDebt: 0, rate: 0.95 }).level).toBe('none');
  });
  it('lead funnel', () => {
    expect(canMoveLead('trial', 'enrolled')).toBe(true);
    expect(canMoveLead('new', 'enrolled')).toBe(false);
    expect(levelFor(70)).toBe('intermediate');
    const f = funnel([{ stage: 'new', reached: 'new' }, { stage: 'trial', reached: 'trial' }, { stage: 'enrolled', reached: 'enrolled' }, { stage: 'lost', reached: 'placement' }]);
    expect(f.map((x) => x.count)).toEqual([4, 3, 2, 1]);
  });
});

describe('test generator', () => {
  const gen = new LocalTestGenerator();
  it('is deterministic and grades correctly', async () => {
    const a = await gen.generate({ topic: 'Present Simple (ingliz tili)', count: 8, locale: 'uz' });
    const b = await gen.generate({ topic: 'Present Simple (ingliz tili)', count: 8, locale: 'uz' });
    expect(a).toEqual(b);
    expect(a.questions).toHaveLength(8);
    const all = Object.fromEntries(a.questions.map((q) => [q.id, q.answer]));
    expect(gradeAttempt(a.questions, all).score).toBe(100);
    expect(gradeAttempt(a.questions, {}).score).toBe(0);
  });
  it('maths answers are computed', async () => {
    const t = await gen.generate({ topic: 'Matematika: foizlar', count: 12, locale: 'uz' });
    for (const q of t.questions) {
      const m = /^(\d+) sonining (\d+)% i/.exec(q.prompt);
      if (m) expect(Number(q.options[q.answer])).toBe((Number(m[1]) * Number(m[2])) / 100);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });
  it('builds gap-fill questions from pasted text', async () => {
    const text = 'Photosynthesis happens in chloroplasts. Chlorophyll absorbs sunlight energy. Plants release oxygen during photosynthesis. Carbon dioxide enters through stomata. Glucose stores chemical energy for later.';
    const t = await gen.generate({ text, count: 4, locale: 'en' });
    expect(t.questions.length).toBeGreaterThanOrEqual(3);
    for (const q of t.questions) expect(q.prompt).toContain('_____');
  });
  it('rejects unknown topics and short texts with a reason', async () => {
    await expect(gen.generate({ topic: 'xyzzy', count: 5, locale: 'uz' })).rejects.toMatchObject({ details: { reason: 'UNKNOWN_TOPIC' } });
    await expect(gen.generate({ text: 'Too short.', count: 5, locale: 'uz' })).rejects.toMatchObject({ details: { reason: 'TEXT_TOO_SHORT' } });
  });
  it('sanitizes untrusted AI output', () => {
    const q = sanitizeQuestions([{ prompt: '<b>2+2?</b>', options: ['3', '4'], answer: 1 }, { prompt: 'bad', options: ['a', 'a'], answer: 0 }, { prompt: 'x', options: ['a', 'b'], answer: 5 }]);
    expect(q).toEqual([{ id: 'q1', prompt: '2+2?', options: ['3', '4'], answer: 1 }]);
  });
});
