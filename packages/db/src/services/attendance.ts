/** Attendance: today's lessons, the roll for one lesson, and marking (parents hear about absences at once). */
import { addDays, datesOn, DomainError, fmtTime, isManager, type AttendanceStatus, type IsoDate } from '@ustoz/core';
import type { Sql } from '../client';
import { listGroups } from './groups';
import type { Actor, Ctx, Member } from './ctx';

/** How far back a teacher may still correct the register (managers: any date). */
export const TEACHER_EDIT_DAYS = 7;

async function roll(tx: Sql, groupId: string, date: IsoDate) {
  return tx.query<{ studentId: string; fullName: string; status: AttendanceStatus | null; streak: number }>(
    `select s.id as student_id, s.full_name, a.status,
            (select count(*)::int from attendance x where x.student_id = s.id and x.group_id = $1 and x.status = 'absent' and x.date < $2::date
               and x.date > coalesce((select max(y.date) from attendance y where y.student_id = s.id and y.group_id = $1 and y.status in ('present','late') and y.date < $2::date), '1900-01-01')) as streak
     from enrollments e join students s on s.id = e.student_id
     left join attendance a on a.group_id = e.group_id and a.student_id = s.id and a.date = $2::date
     where e.group_id = $1 and e.joined_on <= $2::date and (e.left_on is null or e.left_on >= $2::date)
     order by s.full_name`,
    [groupId, date],
  );
}

export function attendanceService(ctx: Ctx) {
  async function lessonCheck(tx: Sql, m: Member, groupId: string, date: IsoDate) {
    await ctx.assertGroupAccess(tx, m, groupId);
    const [g] = await tx.query<{ name: string; days: number[]; startsOn: string; endsOn: string | null; startMin: number; endMin: number }>(
      'select name, days, starts_on, ends_on, start_min, end_min from groups where id = $1', [groupId]);
    if (!g || datesOn(g.days, date, date).length === 0 || date < g.startsOn || (g.endsOn && date > g.endsOn))
      throw new DomainError('VALIDATION', 'The group has no lesson on this date', { field: 'date', reason: 'NO_LESSON' });
    return g;
  }

  return {
    async 'attendance.today'(a: Actor, i: { date?: IsoDate }) {
      return ctx.as(a, 'attendance.mark', async (tx, m) => {
        const date = i.date ?? ctx.today();
        const groups = (await listGroups(tx, date, m)).filter((g) => g.status === 'active' && datesOn(g.days, date, date).length && g.startsOn <= date && (!g.endsOn || g.endsOn >= date));
        const marked = await tx.query<{ groupId: string; n: number; absent: number }>(
          `select group_id, count(*)::int as n, count(*) filter (where status = 'absent')::int as absent from attendance where date = $1 group by group_id`, [date]);
        const mk = new Map(marked.map((x) => [x.groupId, x]));
        return { date, lessons: groups.sort((x, y) => x.startMin - y.startMin).map((g) => ({ ...g, marked: mk.get(g.id)?.n ?? 0, absent: mk.get(g.id)?.absent ?? 0 })) };
      });
    },

    async 'attendance.sheet'(a: Actor, i: { groupId: string; date: IsoDate }) {
      return ctx.as(a, 'attendance.mark', async (tx, m) => {
        const g = await lessonCheck(tx, m, i.groupId, i.date);
        return { group: { id: i.groupId, name: g.name, startMin: g.startMin, endMin: g.endMin }, date: i.date, students: await roll(tx, i.groupId, i.date) };
      });
    },

    async 'attendance.mark'(a: Actor, i: { groupId: string; date: IsoDate; marks: Array<{ studentId: string; status: AttendanceStatus }> }) {
      return ctx.as(a, 'attendance.mark', async (tx, m) => {
        const g = await lessonCheck(tx, m, i.groupId, i.date);
        const today = ctx.today();
        if (i.date > today) throw new DomainError('VALIDATION', 'Cannot mark a future lesson', { field: 'date', reason: 'FUTURE' });
        if (!isManager(m.role) && i.date < addDays(today, -TEACHER_EDIT_DAYS)) throw new DomainError('FORBIDDEN', 'This register is closed', { reason: 'LOCKED' });
        const current = new Map((await roll(tx, i.groupId, i.date)).map((r) => [r.studentId, r]));
        let saved = 0;
        let notified = 0;
        for (const mark of i.marks) {
          const r = current.get(mark.studentId);
          if (!r) throw new DomainError('VALIDATION', 'Student is not in this group on that date', { studentId: mark.studentId });
          if (r.status === mark.status) continue;
          await tx.query(
            `insert into attendance (centre_id, group_id, student_id, date, status, marked_by, marked_at) values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (group_id, student_id, date) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at`,
            [m.centreId, i.groupId, mark.studentId, i.date, mark.status, m.userId, ctx.now().toISOString()],
          );
          saved++;
          // only same-day news is worth a ping; corrections of old registers stay silent
          if ((mark.status === 'absent' || mark.status === 'late') && i.date >= addDays(today, -1)) {
            const streak = mark.status === 'absent' ? r.streak + 1 : 0;
            notified += await ctx.notifyFamily(tx, m.centreId, mark.studentId, mark.status === 'absent' ? 'absent' : 'late', {
              student: r.fullName, group: g.name, date: i.date, time: `${fmtTime(g.startMin)}–${fmtTime(g.endMin)}`, streak,
            });
          }
        }
        if (saved) await ctx.audit(tx, m, 'attendance.mark', 'group', i.groupId, { date: i.date, saved });
        return { saved, notified };
      });
    },
  };
}
