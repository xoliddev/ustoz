import { describe, expect, it } from 'vitest';
import { addDays, findConflicts, monthOf, som, todayIn, weekday } from '@ustoz/core';
import { ADAPTERS, seeded, type S } from './harness';

describe.each(ADAPTERS)('flows ($name)', ({ make }) => {
  let s: S;
  // Wednesday 2026-11-18 12:00 Tashkent
  it('seeds and signs in every persona', async () => {
    s = await seeded(make, '2026-11-18T07:00:00Z');
    for (const r of ['director', 'admin', 'teacher', 'student', 'parent'] as const) expect(s.as[r].role).toBe(r);
    const me = await s.m.me(s.as.parent, {});
    expect(me.personName).toBe('Shoira Karimova');
  });

  it('dashboard summary has revenue, debts, attendance, risk and load', async () => {
    const d = await s.m['dashboard.summary'](s.as.director, {});
    expect(d.revenue).toHaveLength(6);
    expect(d.revenue.at(-2)!.collected).toBeGreaterThan(0);
    expect(d.debtors).toBeGreaterThan(0);
    expect(d.attendance.rate).toBeGreaterThan(0.6);
    expect(d.riskCount).toBeGreaterThanOrEqual(5);
    expect(d.load.length).toBe(8);
  });

  it('timetable has no conflicts and a week view', async () => {
    const groups = await s.m['groups.list'](s.as.admin, {});
    expect(findConflicts(groups.map((g) => ({ id: g.id, roomId: g.roomId, teacherId: g.teacherId, days: g.days, start: g.startMin, end: g.endMin, from: g.startsOn, to: g.endsOn })))).toEqual([]);
    const w = await s.m['schedule.week'](s.as.admin, {});
    expect(w.lessons.length).toBeGreaterThan(30);
    const mine = await s.m['schedule.week'](s.as.teacher, {});
    expect(new Set(mine.lessons.map((l) => l.name))).toEqual(new Set(["A2-14", "A2-15"])); // A2-16 starts next week
    const kid = await s.m['schedule.week'](s.as.student, {});
    expect(new Set(kid.lessons.map((l) => l.name))).toEqual(new Set(['A2-14']));
  });

  it('a clashing group is refused with the conflict details', async () => {
    const st = await s.m['org.structure'](s.as.admin, {});
    const a2 = (await s.m['groups.list'](s.as.admin, {})).find((g) => g.name === 'A2-14')!;
    const input = { name: 'Clash', courseId: st.courses[0]!.id, teacherId: st.teachers.find((t) => t.fullName === 'Nodira Aliyeva')!.id, roomId: a2.roomId, branchId: a2.branchId, days: [1], startMin: 600, endMin: 690, startsOn: s.clock.now().toISOString().slice(0, 10), endsOn: null, capacity: 10 };
    const c = await s.m['groups.checkConflicts'](s.as.admin, input);
    expect(c.conflicts.map((x) => x.kind)).toEqual(['room']);
    await expect(s.m['groups.save'](s.as.admin, input)).rejects.toMatchObject({ code: 'SCHEDULE_CONFLICT' });
    expect((await s.m['groups.save'](s.as.admin, { ...input, startMin: 630, endMin: 720 })).id).toBeTruthy();
  });

  it('teacher marks attendance; parents get an instant message', async () => {
    const today = todayIn(s.clock.now());
    const t = await s.m['attendance.today'](s.as.teacher, {});
    expect(t.lessons.map((l) => l.name)).toEqual(['A2-14', 'A2-15']); // Wednesday
    const a2 = t.lessons[0]!;
    const sheet = await s.m['attendance.sheet'](s.as.teacher, { groupId: a2.id, date: today });
    const aziz = sheet.students.find((x) => x.fullName === 'Aziz Karimov')!;
    const before = await s.m['notifications.mine'](s.as.parent, {});
    const marks = sheet.students.map((x) => ({ studentId: x.studentId, status: x.studentId === aziz.studentId ? ('absent' as const) : ('present' as const) }));
    const r = await s.m['attendance.mark'](s.as.teacher, { groupId: a2.id, date: today, marks });
    expect(r.saved).toBe(sheet.students.length);
    expect(r.notified).toBeGreaterThanOrEqual(1);
    const after = await s.m['notifications.mine'](s.as.parent, {});
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)).toMatchObject({ template: 'absent', params: { student: 'Aziz Karimov', group: 'A2-14' } });
    // re-saving the same marks changes nothing and notifies nobody
    expect(await s.m['attendance.mark'](s.as.teacher, { groupId: a2.id, date: today, marks })).toEqual({ saved: 0, notified: 0 });
    // other teacher's group / a non-lesson day / the future are refused
    const other = (await s.m['groups.list'](s.as.admin, {})).find((g) => g.name === 'Python P-9')!;
    await expect(s.m['attendance.sheet'](s.as.teacher, { groupId: other.id, date: today })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.m['attendance.sheet'](s.as.teacher, { groupId: a2.id, date: addDays(today, 1) })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(weekday(addDays(today, 2))).toBe(5);
    await expect(s.m['attendance.mark'](s.as.teacher, { groupId: a2.id, date: addDays(today, 2), marks })).rejects.toMatchObject({ details: { reason: 'FUTURE' } });
  });

  it('cash payment issues a numbered receipt and reduces the debt exactly', async () => {
    const debtors = await s.m['billing.debtors'](s.as.admin, {});
    const d = debtors[0]!;
    const r = await s.m['payments.record'](s.as.admin, { studentId: d.id, amount: d.debt, method: 'cash' });
    expect(r.receiptNo).toMatch(/^R-\d{4}-\d{6}$/);
    expect(r.balanceAfter).toBe(0);
    const st = await s.m['billing.statement'](s.as.admin, { studentId: d.id });
    expect(st.debt).toBe(0);
    expect(st.invoices.every((x) => x.status === 'paid')).toBe(true);
  });

  it('enrolling mid-month bills only remaining lessons', async () => {
    const created = await s.m['students.create'](s.as.admin, { fullName: 'Test Talaba', phone: '90 777 11 22', parent: { fullName: 'Test Ota', phone: '93 777 11 22' } });
    const g = (await s.m['groups.list'](s.as.admin, {})).find((x) => x.name === 'Rus tili R-2')!;
    const r = await s.m['groups.enroll'](s.as.admin, { groupId: g.id, studentId: created.id, joinedOn: '2026-11-18' });
    expect(r.invoice!.month).toBe(monthOf('2026-11-18'));
    // Nov 2026 Tue/Thu/Sat: 12 lessons; from the 18th: 19,21,24,26,28 = 5
    expect(r.invoice!.lessonsInMonth).toBe(12);
    expect(r.invoice!.lessonsBilled).toBe(5);
    expect(r.invoice!.total).toBeLessThan(som(400_000));
  });

  it('roles cannot reach beyond their rights', async () => {
    await expect(s.m['dashboard.summary'](s.as.teacher, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.m['payroll.report'](s.as.admin, { month: '2026-11' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.m['billing.debtors'](s.as.parent, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const strangers = (await s.m['students.list'](s.as.admin, {})).find((x) => x.fullName !== 'Aziz Karimov' && x.fullName !== 'Madina Karimova')!;
    await expect(s.m['billing.statement'](s.as.parent, { studentId: strangers.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const teacherList = await s.m['students.list'](s.as.teacher, {});
    expect(teacherList.every((x) => x.debt === 0)).toBe(true);
  });

  it('payroll covers all three schemes and is exact', async () => {
    const p = await s.m['payroll.report'](s.as.director, { month: monthOf(todayIn(s.clock.now())) });
    expect(new Set(p.rows.map((r) => r.rule.scheme))).toEqual(new Set(['fixed', 'per_student', 'percent']));
    expect(p.total).toBe(p.rows.reduce((x, r) => x + r.payslip.total, 0));
    for (const r of p.rows) for (const l of r.payslip.lines) expect(Number.isSafeInteger(l.amount)).toBe(true);
    const mine = await s.m['payroll.mine'](s.as.teacher, { month: '2026-11' });
    expect(mine!.fullName).toBe('Dilnoza Karimova');
  });

  it('closes', async () => {
    await s.close();
  });
});
