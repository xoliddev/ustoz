/** Students and parents: list with money/attendance/risk signals, profile, create. */
import { addDays, attendanceRate, churnRisk, DomainError, missedStreak, normalizePhone, uuidv7, type AttendanceStatus } from '@ustoz/core';
import type { Sql } from '../client';
import { balances } from './billing-core';
import type { Actor, Ctx, Member } from './ctx';

export interface StudentListRow {
  id: string;
  fullName: string;
  phone: string | null;
  status: 'active' | 'left';
  groups: Array<{ id: string; name: string }>;
  parentName: string | null;
  debt: number;
  overdue: number;
  rate: number | null;
  streak: number;
  risk: ReturnType<typeof churnRisk>;
}

/** Signals per student over the last 30 days (attendance) and all time (money). */
export async function studentSignals(tx: Sql, today: string, ids: string[] | null) {
  const from = addDays(today, -30);
  const att = await tx.query<{ studentId: string; date: string; status: AttendanceStatus }>(
    `select student_id, date, status from attendance where date >= $1::date and date <= $2::date and ($3::uuid[] is null or student_id = any($3::uuid[])) order by date`,
    [from, today, ids],
  );
  const byStudent = new Map<string, Array<{ date: string; status: AttendanceStatus }>>();
  for (const r of att) {
    let l = byStudent.get(r.studentId);
    if (!l) byStudent.set(r.studentId, (l = []));
    l.push(r);
  }
  const money = await balances(tx, ids, today);
  return (id: string) => {
    const h = byStudent.get(id) ?? [];
    const b = money.get(id) ?? { debt: 0, overdue: 0, paid: 0, invoiced: 0, credit: 0 };
    const rate = attendanceRate(h.map((x) => x.status));
    const streak = missedStreak(h);
    return { debt: b.debt, overdue: b.overdue, credit: b.credit, rate, streak, risk: churnRisk({ missedStreak: streak, overdueDebt: b.overdue, rate }), history: h };
  };
}

export async function listStudents(tx: Sql, today: string, m: Member): Promise<StudentListRow[]> {
  const teacherOnly = m.role === 'teacher';
  const rows = await tx.query<{ id: string; fullName: string; phone: string | null; status: 'active' | 'left'; groups: Array<{ id: string; name: string }> | null; parentName: string | null }>(
    `select s.id, s.full_name, s.phone, s.status,
            (select json_agg(json_build_object('id', g.id, 'name', g.name) order by g.name) from enrollments e join groups g on g.id = e.group_id
              where e.student_id = s.id and e.left_on is null) as groups,
            (select p.full_name from student_parents sp join parents p on p.id = sp.parent_id where sp.student_id = s.id order by p.full_name limit 1) as parent_name
     from students s
     where (not $1::boolean or exists (select 1 from enrollments e join groups g on g.id = e.group_id where e.student_id = s.id and e.left_on is null and g.teacher_id = $2))
     order by s.full_name`,
    [teacherOnly, m.personId],
  );
  const sig = await studentSignals(tx, today, null);
  return rows.map((r) => {
    const s = sig(r.id);
    // teachers see attendance signals but not family finances
    return { ...r, groups: r.groups ?? [], debt: teacherOnly ? 0 : s.debt, overdue: teacherOnly ? 0 : s.overdue, rate: s.rate, streak: s.streak, risk: teacherOnly ? churnRisk({ missedStreak: s.streak, overdueDebt: 0, rate: s.rate }) : s.risk };
  });
}

export function studentsService(ctx: Ctx) {
  return {
    /** Student: themselves; parent: their children (with groups) — the child switcher and the bot use it. */
    async 'family.children'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'self.read', async (tx, m) => {
        const ids = await ctx.ownStudents(tx, m);
        return tx.query<{ id: string; fullName: string; groups: string[] }>(
          `select s.id, s.full_name, coalesce((select array_agg(g.name order by g.name) from enrollments e join groups g on g.id = e.group_id where e.student_id = s.id and e.left_on is null), '{}') as groups
           from students s where s.id = any($1::uuid[]) order by s.full_name`,
          [ids],
        );
      });
    },

    async 'students.list'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'students.read', (tx, m) => listStudents(tx, ctx.today(), m));
    },

    async 'students.get'(a: Actor, i: { studentId: string }) {
      return ctx.as(a, 'students.read', async (tx, m) => {
        if (m.role === 'teacher') {
          const [ok] = await tx.query('select 1 from enrollments e join groups g on g.id = e.group_id where e.student_id = $1 and g.teacher_id = $2', [i.studentId, m.personId]);
          if (!ok) throw new DomainError('FORBIDDEN', 'Not your student');
        }
        const [s] = await tx.query<{ id: string; fullName: string; phone: string | null; birthYear: number | null; status: string; createdAt: string; telegramLinked: boolean }>(
          'select id, full_name, phone, birth_year, status, created_at, telegram_id is not null as telegram_linked from students where id = $1', [i.studentId]);
        if (!s) throw new DomainError('NOT_FOUND', 'Student not found');
        const parents = await tx.query<{ id: string; fullName: string; phone: string | null; telegramLinked: boolean }>(
          'select p.id, p.full_name, p.phone, p.telegram_id is not null as telegram_linked from student_parents sp join parents p on p.id = sp.parent_id where sp.student_id = $1', [i.studentId]);
        const enrollments = await tx.query<{ id: string; groupId: string; groupName: string; joinedOn: string; leftOn: string | null; monthlyFee: number }>(
          'select e.id, e.group_id, g.name as group_name, e.joined_on, e.left_on, g.monthly_fee from enrollments e join groups g on g.id = e.group_id where e.student_id = $1 order by e.joined_on', [i.studentId]);
        const sig = (await studentSignals(tx, ctx.today(), [i.studentId]))(i.studentId);
        const finance = m.role === 'teacher' ? null : { debt: sig.debt, overdue: sig.overdue, credit: sig.credit };
        return { student: s, parents, enrollments, signals: { rate: sig.rate, streak: sig.streak, risk: sig.risk }, finance, attendance: sig.history };
      });
    },

    async 'students.create'(a: Actor, i: { fullName: string; phone?: string | null; birthYear?: number | null; parent?: { fullName: string; phone: string } | null }) {
      return ctx.as(a, 'students.manage', async (tx, m) => {
        const t = ctx.now().getTime();
        const id = uuidv7(t);
        const phone = i.phone ? normalizePhone(i.phone) : null;
        if (i.phone && !phone) throw new DomainError('VALIDATION', 'Invalid phone number', { field: 'phone' });
        await tx.query('insert into students (centre_id, id, full_name, phone, birth_year, created_at) values ($1,$2,$3,$4,$5,$6)', [m.centreId, id, i.fullName.trim(), phone, i.birthYear ?? null, ctx.now().toISOString()]);
        if (i.parent) {
          const pPhone = normalizePhone(i.parent.phone);
          if (!pPhone) throw new DomainError('VALIDATION', 'Invalid parent phone number', { field: 'parent.phone' });
          const [existing] = await tx.query<{ id: string }>('select id from parents where phone = $1', [pPhone]);
          const parentId = existing?.id ?? uuidv7(t + 1);
          if (!existing) await tx.query('insert into parents (centre_id, id, full_name, phone) values ($1,$2,$3,$4)', [m.centreId, parentId, i.parent.fullName.trim(), pPhone]);
          await tx.query('insert into student_parents (centre_id, student_id, parent_id) values ($1,$2,$3)', [m.centreId, id, parentId]);
        }
        await ctx.audit(tx, m, 'student.create', 'student', id, { fullName: i.fullName });
        return { id };
      });
    },
  };
}
