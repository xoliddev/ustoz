/** Groups, enrolments and the timetable (with room/teacher conflict detection). */
import {
  addDays, conflictsFor, DomainError, fmtTime, lessonsBetween, monthOf, uuidv7, validSlotTimes, weekStart, type Conflict, type IsoDate, type Slot,
} from '@ustoz/core';
import type { Sql } from '../client';
import { billEnrollment } from './billing-core';
import type { Actor, Ctx, Member } from './ctx';

export interface GroupRow {
  id: string;
  name: string;
  courseId: string;
  courseName: string;
  subject: string;
  color: string;
  teacherId: string | null;
  teacherName: string | null;
  roomId: string | null;
  roomName: string | null;
  branchId: string;
  branchName: string;
  days: number[];
  startMin: number;
  endMin: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  monthlyFee: number;
  capacity: number;
  status: 'active' | 'finished';
  students: number;
}

const GROUP_SELECT = `
  select g.id, g.name, g.course_id, c.name as course_name, c.subject, c.color, g.teacher_id, t.full_name as teacher_name, g.room_id, r.name as room_name,
         g.branch_id, b.name as branch_name, g.days, g.start_min, g.end_min, g.starts_on, g.ends_on, g.monthly_fee, g.capacity, g.status,
         (select count(*)::int from enrollments e where e.group_id = g.id and (e.left_on is null or e.left_on >= $1::date)) as students
  from groups g join courses c on c.id = g.course_id join branches b on b.id = g.branch_id
  left join teachers t on t.id = g.teacher_id left join rooms r on r.id = g.room_id`;

export async function listGroups(tx: Sql, today: IsoDate, m: Member): Promise<GroupRow[]> {
  const own = m.role === 'teacher' ? ' where g.teacher_id = $2' : '';
  return tx.query<GroupRow>(`${GROUP_SELECT}${own} order by g.status, g.start_min, g.name`, m.role === 'teacher' ? [today, m.personId] : [today]);
}

const toSlot = (g: { id: string; name: string; roomId: string | null; teacherId: string | null; days: number[]; startMin: number; endMin: number; startsOn: string; endsOn: string | null }): Slot => ({
  id: g.id, label: g.name, roomId: g.roomId, teacherId: g.teacherId, days: g.days, start: g.startMin, end: g.endMin, from: g.startsOn, to: g.endsOn,
});

export interface GroupInput {
  id?: string;
  name: string;
  courseId: string;
  teacherId: string | null;
  roomId: string | null;
  branchId: string;
  days: number[];
  startMin: number;
  endMin: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  monthlyFee?: number;
  capacity: number;
}

async function conflictsOf(tx: Sql, i: GroupInput): Promise<Array<Conflict & { otherName: string }>> {
  const others = await tx.query<{ id: string; name: string; roomId: string | null; teacherId: string | null; days: number[]; startMin: number; endMin: number; startsOn: string; endsOn: string | null }>(
    `select id, name, room_id, teacher_id, days, start_min, end_min, starts_on, ends_on from groups where status = 'active' and id <> coalesce($1::uuid, '00000000-0000-0000-0000-000000000000')`,
    [i.id ?? null],
  );
  const names = new Map(others.map((o) => [o.id, o.name]));
  const me = toSlot({ ...i, id: i.id ?? 'new', endsOn: i.endsOn ?? null });
  return conflictsFor(me, others.map(toSlot)).map((c) => ({ ...c, otherName: names.get(c.b) ?? '' }));
}

export async function enrollStudent(ctx: Ctx, tx: Sql, m: Member, i: { groupId: string; studentId: string; joinedOn: IsoDate; customBp?: number }) {
  const [dup] = await tx.query('select 1 from enrollments where group_id = $1 and student_id = $2 and left_on is null', [i.groupId, i.studentId]);
  if (dup) throw new DomainError('CONFLICT', 'Student is already in this group');
  const [g] = await tx.query<{ capacity: number; n: number }>(
    `select g.capacity, (select count(*)::int from enrollments e where e.group_id = g.id and e.left_on is null) as n from groups g where g.id = $1`, [i.groupId]);
  if (!g) throw new DomainError('NOT_FOUND', 'Group not found');
  if (g.n >= g.capacity) throw new DomainError('CONFLICT', 'Group is full', { reason: 'GROUP_FULL' });
  const [s] = await tx.query('select 1 from students where id = $1', [i.studentId]);
  if (!s) throw new DomainError('NOT_FOUND', 'Student not found');
  const id = uuidv7(ctx.now().getTime());
  await tx.query('insert into enrollments (centre_id, id, group_id, student_id, joined_on, custom_bp) values ($1,$2,$3,$4,$5,$6)', [m.centreId, id, i.groupId, i.studentId, i.joinedOn, i.customBp ?? 0]);
  const month = monthOf(i.joinedOn) >= monthOf(ctx.today()) ? monthOf(i.joinedOn) : monthOf(ctx.today());
  const invoice = await billEnrollment(tx, m.centreId, id, month, ctx.now());
  await ctx.audit(tx, m, 'enrollment.create', 'enrollment', id, { groupId: i.groupId, studentId: i.studentId });
  return { enrollmentId: id, invoice };
}

export function groupsService(ctx: Ctx) {
  return {
    async 'groups.list'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'groups.read', (tx, m) => listGroups(tx, ctx.today(), m));
    },

    async 'groups.get'(a: Actor, i: { groupId: string }) {
      return ctx.as(a, 'groups.read', async (tx, m) => {
        await ctx.assertGroupAccess(tx, m, i.groupId);
        const [g] = await tx.query<GroupRow>(`${GROUP_SELECT} where g.id = $2`, [ctx.today(), i.groupId]);
        const students = await tx.query<{ enrollmentId: string; studentId: string; fullName: string; phone: string | null; joinedOn: string; leftOn: string | null; customBp: number }>(
          `select e.id as enrollment_id, s.id as student_id, s.full_name, s.phone, e.joined_on, e.left_on, e.custom_bp
           from enrollments e join students s on s.id = e.student_id where e.group_id = $1 order by e.left_on nulls first, s.full_name`,
          [i.groupId],
        );
        return { group: g!, students };
      });
    },

    /** Live conflict check for the group form (nothing is saved). */
    async 'groups.checkConflicts'(a: Actor, i: GroupInput) {
      return ctx.as(a, 'groups.manage', async (tx) => ({ conflicts: await conflictsOf(tx, i) }));
    },

    async 'groups.save'(a: Actor, i: GroupInput) {
      return ctx.as(a, 'groups.manage', async (tx, m) => {
        if (!validSlotTimes(i.startMin, i.endMin)) throw new DomainError('VALIDATION', 'Lesson must be 30+ minutes within one day', { field: 'endMin' });
        if (i.endsOn && i.endsOn < i.startsOn) throw new DomainError('VALIDATION', 'End date is before start date', { field: 'endsOn' });
        const conflicts = await conflictsOf(tx, i);
        if (conflicts.length) {
          const c = conflicts[0]!;
          throw new DomainError('SCHEDULE_CONFLICT', `${c.kind} conflict with ${c.otherName} at ${fmtTime(c.start)}–${fmtTime(c.end)}`, { conflicts });
        }
        const [course] = await tx.query<{ monthlyFee: number }>('select monthly_fee from courses where id = $1', [i.courseId]);
        if (!course) throw new DomainError('NOT_FOUND', 'Course not found');
        if (i.roomId) {
          const [room] = await tx.query<{ branchId: string }>('select branch_id from rooms where id = $1', [i.roomId]);
          if (!room || room.branchId !== i.branchId) throw new DomainError('VALIDATION', 'Room belongs to another branch', { field: 'roomId' });
        }
        const id = i.id ?? uuidv7(ctx.now().getTime());
        await tx.query(
          `insert into groups (centre_id, id, course_id, teacher_id, room_id, branch_id, name, days, start_min, end_min, starts_on, ends_on, monthly_fee, capacity)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           on conflict (id) do update set course_id = excluded.course_id, teacher_id = excluded.teacher_id, room_id = excluded.room_id, branch_id = excluded.branch_id,
             name = excluded.name, days = excluded.days, start_min = excluded.start_min, end_min = excluded.end_min, starts_on = excluded.starts_on,
             ends_on = excluded.ends_on, monthly_fee = excluded.monthly_fee, capacity = excluded.capacity`,
          [m.centreId, id, i.courseId, i.teacherId, i.roomId, i.branchId, i.name, [...new Set(i.days)].sort(), i.startMin, i.endMin, i.startsOn, i.endsOn, i.monthlyFee ?? course.monthlyFee, i.capacity],
        );
        await ctx.audit(tx, m, i.id ? 'group.update' : 'group.create', 'group', id, { name: i.name });
        return { id };
      });
    },

    /** Adds a student to a group and bills the current month prorated from the join date. */
    async 'groups.enroll'(a: Actor, i: { groupId: string; studentId: string; joinedOn: IsoDate; customBp?: number }) {
      return ctx.as(a, 'students.manage', (tx, m) => enrollStudent(ctx, tx, m, i));
    },

    async 'groups.unenroll'(a: Actor, i: { enrollmentId: string; leftOn: IsoDate }) {
      return ctx.as(a, 'students.manage', async (tx, m) => {
        const r = await tx.query('update enrollments set left_on = $2 where id = $1 and left_on is null returning id', [i.enrollmentId, i.leftOn]);
        if (!r.length) throw new DomainError('NOT_FOUND', 'Active enrolment not found');
        // re-bill the month they leave in, so they only pay for lessons up to the leave date
        await billEnrollment(tx, m.centreId, i.enrollmentId, monthOf(i.leftOn), ctx.now(), { replace: true });
        await ctx.audit(tx, m, 'enrollment.end', 'enrollment', i.enrollmentId, { leftOn: i.leftOn });
        return { ok: true };
      });
    },

    /** Lessons of a week (Monday-based) for the timetable; teachers see their own, students/parents theirs. */
    async 'schedule.week'(a: Actor, i: { weekOf?: IsoDate; branchId?: string | null }) {
      const perm = a.role === 'student' || a.role === 'parent' ? 'self.read' : 'groups.read';
      return ctx.as(a, perm, async (tx, m) => {
        const from = weekStart(i.weekOf ?? ctx.today());
        const to = addDays(from, 6);
        let groups = await listGroups(tx, ctx.today(), m);
        if (m.role === 'student' || m.role === 'parent') {
          const own = await ctx.ownStudents(tx, m);
          const ids = new Set((await tx.query<{ groupId: string }>('select distinct group_id from enrollments where student_id = any($1::uuid[]) and left_on is null', [own])).map((r) => r.groupId));
          groups = groups.filter((g) => ids.has(g.id));
        }
        if (i.branchId) groups = groups.filter((g) => g.branchId === i.branchId);
        const active = groups.filter((g) => g.status === 'active');
        const lessons = lessonsBetween(active.map((g) => ({ ...toSlot(g), group: g })), from, to).map(({ slot, date }) => ({
          date, groupId: slot.group.id, name: slot.group.name, courseName: slot.group.courseName, color: slot.group.color, teacherName: slot.group.teacherName,
          roomId: slot.group.roomId, roomName: slot.group.roomName, branchName: slot.group.branchName, startMin: slot.start, endMin: slot.end, students: slot.group.students,
        }));
        return { from, to, today: ctx.today(), lessons };
      });
    },
  };
}
