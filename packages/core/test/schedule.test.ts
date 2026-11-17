import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, datesOn, findConflicts, lessonsBetween, slotsConflict, weekday, type Slot } from '../src';

const base: Slot = { id: 'a', roomId: 'r1', teacherId: 't1', days: [1, 3, 5], start: 9 * 60, end: 10 * 60 + 30, from: '2026-09-01', to: null };

describe('schedule conflicts', () => {
  it('same room, overlapping time and day → room conflict', () => {
    const c = slotsConflict(base, { ...base, id: 'b', teacherId: 't2', days: [3], start: 10 * 60, end: 11 * 60 });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'room', days: [3], start: 600, end: 630 });
  });

  it('back-to-back lessons do not clash (half-open intervals)', () => {
    expect(slotsConflict(base, { ...base, id: 'b', start: 10 * 60 + 30, end: 12 * 60 })).toEqual([]);
  });

  it('same teacher in another room is a teacher conflict', () => {
    expect(slotsConflict(base, { ...base, id: 'b', roomId: 'r2' }).map((c) => c.kind)).toEqual(['teacher']);
  });

  it('groups that never run at the same time of year do not clash', () => {
    expect(slotsConflict({ ...base, to: '2026-10-31' }, { ...base, id: 'b', from: '2026-11-01' })).toEqual([]);
  });

  it('a short overlap of date ranges only counts weekdays that really occur in it', () => {
    // a ends Tue 2026-11-03, b starts Mon 2026-11-02 → overlap Mon+Tue; shared days Mon/Wed → only Mon
    const c = slotsConflict({ ...base, days: [1, 3], to: '2026-11-03' }, { ...base, id: 'b', days: [1, 3], from: '2026-11-02' });
    expect(c.map((x) => x.days)).toEqual([[1], [1]]);
    expect(c[0]!.firstDate).toBe('2026-11-02');
  });

  it('matches a brute-force minute-by-minute check (property)', () => {
    const slot = (id: string) =>
      fc.record({
        id: fc.constant(id),
        roomId: fc.constantFrom('r1', 'r2', null),
        teacherId: fc.constantFrom('t1', 't2', null),
        days: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 4 }),
        start: fc.integer({ min: 8 * 4, max: 20 * 4 }).map((q) => q * 15),
        len: fc.integer({ min: 2, max: 12 }).map((q) => q * 15),
        fromOff: fc.integer({ min: 0, max: 20 }),
        span: fc.option(fc.integer({ min: 0, max: 20 }), { nil: null }),
      });
    const toSlot = (s: { id: string; roomId: string | null; teacherId: string | null; days: number[]; start: number; len: number; fromOff: number; span: number | null }): Slot => ({
      id: s.id, roomId: s.roomId, teacherId: s.teacherId, days: s.days, start: s.start, end: s.start + s.len,
      from: addDays('2026-11-02', s.fromOff), to: s.span === null ? null : addDays('2026-11-02', s.fromOff + s.span),
    });
    fc.assert(
      fc.property(slot('a'), slot('b'), (ra, rb) => {
        const a = toSlot(ra);
        const b = toSlot(rb);
        const expected = new Set<string>();
        const horizon = '2026-12-31';
        const aDates = new Set(datesOn(a.days, a.from, a.to ?? horizon));
        for (const d of datesOn(b.days, b.from, b.to ?? horizon)) {
          if (!aDates.has(d)) continue;
          for (let m = 0; m < 24 * 60; m++) {
            if (m >= a.start && m < a.end && m >= b.start && m < b.end) {
              if (a.roomId && a.roomId === b.roomId) expected.add(`room:${weekday(d)}`);
              if (a.teacherId && a.teacherId === b.teacherId) expected.add(`teacher:${weekday(d)}`);
              break;
            }
          }
        }
        const got = new Set(slotsConflict(a, b).flatMap((c) => c.days.map((d) => `${c.kind}:${d}`)));
        expect([...got].sort()).toEqual([...expected].sort());
      }),
      { numRuns: 300 },
    );
  });

  it('findConflicts reports each clashing pair once', () => {
    const s = [base, { ...base, id: 'b' }, { ...base, id: 'c', roomId: 'r9', teacherId: 't9' }];
    expect(findConflicts(s).map((c) => `${c.a}-${c.b}-${c.kind}`)).toEqual(['a-b-room', 'a-b-teacher']);
  });

  it('lessonsBetween lists concrete lessons in date and time order', () => {
    const l = lessonsBetween([base, { ...base, id: 'b', days: [2], start: 8 * 60 }], '2026-11-02', '2026-11-04');
    expect(l.map((x) => `${x.date}:${x.slot.id}`)).toEqual(['2026-11-02:a', '2026-11-03:b', '2026-11-04:a']);
  });
});
