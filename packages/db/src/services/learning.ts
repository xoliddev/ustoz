/** Homework (submitted through the bot or Mini App, graded on the web) and student progress. */
import { DomainError, isManager, monthOf, uuidv7, type IsoDate } from '@ustoz/core';
import type { Sql } from '../client';
import type { Actor, Ctx, Member } from './ctx';

export async function studentGroups(tx: Sql, studentId: string): Promise<string[]> {
  return (await tx.query<{ groupId: string }>('select group_id from enrollments where student_id = $1 and left_on is null', [studentId])).map((r) => r.groupId);
}

export async function notifyGroupStudents(ctx: Ctx, tx: Sql, centreId: string, groupId: string, template: string, params: Record<string, unknown>): Promise<number> {
  const rows = await tx.query<{ id: string; telegramId: number | null; locale: string }>(
    'select s.id, s.telegram_id, s.locale from enrollments e join students s on s.id = e.student_id where e.group_id = $1 and e.left_on is null', [groupId]);
  for (const r of rows) await ctx.enqueue(tx, centreId, { kind: 'student', id: r.id, telegramId: r.telegramId, locale: r.locale }, template, params);
  return rows.length;
}

export function learningService(ctx: Ctx) {
  const selfRole = (a: Actor) => a.role === 'student' || a.role === 'parent';

  async function staffGroups(tx: Sql, m: Member): Promise<string[] | null> {
    if (isManager(m.role)) return null;
    return (await tx.query<{ id: string }>('select id from groups where teacher_id = $1', [m.personId])).map((r) => r.id);
  }

  return {
    async 'homework.mine'(a: Actor, i: { studentId?: string | null }) {
        return ctx.as(a, 'self.read', async (tx, m) => {
          const sid = await ctx.ownStudent(tx, m, i.studentId);
          return tx.query<{ id: string; groupId: string; groupName: string; title: string; description: string; dueOn: string; submissionId: string | null; kind: string | null; submittedAt: string | null; grade: number | null; feedback: string | null }>(
            `select h.id, h.group_id, g.name as group_name, h.title, h.description, h.due_on, s.id as submission_id, s.kind, s.submitted_at, s.grade, s.feedback
             from homework h join groups g on g.id = h.group_id left join submissions s on s.homework_id = h.id and s.student_id = $1
             where h.group_id = any($2::uuid[]) order by h.due_on desc, h.created_at desc limit 50`,
            [sid, await studentGroups(tx, sid)],
          );
        });
    },

    async 'homework.list'(a: Actor, i: { groupId?: string | null }) {
      return ctx.as(a, 'homework.manage', async (tx, m) => {
        if (i.groupId) await ctx.assertGroupAccess(tx, m, i.groupId);
        const own = await staffGroups(tx, m);
        return tx.query<{ id: string; groupId: string; groupName: string; title: string; description: string; dueOn: string; students: number; submitted: number; graded: number }>(
          `select h.id, h.group_id, g.name as group_name, h.title, h.description, h.due_on,
                  (select count(*)::int from enrollments e where e.group_id = h.group_id and e.left_on is null) as students,
                  (select count(*)::int from submissions s where s.homework_id = h.id) as submitted,
                  (select count(*)::int from submissions s where s.homework_id = h.id and s.grade is not null) as graded
           from homework h join groups g on g.id = h.group_id
           where ($1::uuid is null or h.group_id = $1) and ($2::uuid[] is null or h.group_id = any($2::uuid[]))
           order by h.due_on desc, h.created_at desc limit 100`,
          [i.groupId ?? null, own],
        );
      });
    },

    async 'homework.create'(a: Actor, i: { groupId: string; title: string; description: string; dueOn: IsoDate }) {
      return ctx.as(a, 'homework.manage', async (tx, m) => {
        await ctx.assertGroupAccess(tx, m, i.groupId);
        if (i.dueOn < ctx.today()) throw new DomainError('VALIDATION', 'Due date is in the past', { field: 'dueOn' });
        const id = uuidv7(ctx.now().getTime());
        await tx.query('insert into homework (centre_id, id, group_id, title, description, due_on, created_by, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
          m.centreId, id, i.groupId, i.title, i.description, i.dueOn, m.userId, ctx.now().toISOString(),
        ]);
        const [g] = await tx.query<{ name: string }>('select name from groups where id = $1', [i.groupId]);
        const notified = await notifyGroupStudents(ctx, tx, m.centreId, i.groupId, 'homework_new', { title: i.title, group: g!.name, due: i.dueOn });
        return { id, notified };
      });
    },

    async 'homework.submissions'(a: Actor, i: { homeworkId: string }) {
      return ctx.as(a, 'homework.manage', async (tx, m) => {
        const [h] = await tx.query<{ groupId: string; title: string; dueOn: string }>('select group_id, title, due_on from homework where id = $1', [i.homeworkId]);
        if (!h) throw new DomainError('NOT_FOUND', 'Homework not found');
        await ctx.assertGroupAccess(tx, m, h.groupId);
        const rows = await tx.query<{ studentId: string; fullName: string; submissionId: string | null; kind: string | null; body: string | null; fileName: string | null; fileData: string | null; submittedAt: string | null; grade: number | null; feedback: string | null }>(
          `select st.id as student_id, st.full_name, s.id as submission_id, s.kind, s.body, s.file_name, s.file_data, s.submitted_at, s.grade, s.feedback
           from enrollments e join students st on st.id = e.student_id left join submissions s on s.homework_id = $1 and s.student_id = st.id
           where e.group_id = $2 and e.left_on is null order by s.submitted_at nulls last, st.full_name`,
          [i.homeworkId, h.groupId],
        );
        return { homework: { id: i.homeworkId, ...h }, rows };
      });
    },

    async 'homework.submit'(a: Actor, i: { homeworkId: string; kind: 'text' | 'photo' | 'file'; body: string; fileName?: string | null; fileData?: string | null }) {
      return ctx.as(a, 'homework.submit', async (tx, m) => {
        const sid = await ctx.ownStudent(tx, m, null);
        const [h] = await tx.query<{ groupId: string; title: string }>('select group_id, title from homework where id = $1', [i.homeworkId]);
        if (!h || !(await studentGroups(tx, sid)).includes(h.groupId)) throw new DomainError('NOT_FOUND', 'Homework not found');
        if (i.kind !== 'text' && !i.fileData) throw new DomainError('VALIDATION', 'Attach a file', { field: 'fileData' });
        const [prev] = await tx.query<{ grade: number | null }>('select grade from submissions where homework_id = $1 and student_id = $2', [i.homeworkId, sid]);
        if (prev && prev.grade !== null) throw new DomainError('CONFLICT', 'Already graded', { reason: 'GRADED' });
        const id = uuidv7(ctx.now().getTime());
        await tx.query(
          `insert into submissions (centre_id, id, homework_id, student_id, kind, body, file_name, file_data, submitted_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           on conflict (homework_id, student_id) do update set kind = excluded.kind, body = excluded.body, file_name = excluded.file_name, file_data = excluded.file_data, submitted_at = excluded.submitted_at`,
          [m.centreId, id, i.homeworkId, sid, i.kind, i.body, i.fileName ?? null, i.fileData ?? null, ctx.now().toISOString()],
        );
        return { ok: true, title: h.title, resubmitted: !!prev };
      });
    },

    async 'homework.grade'(a: Actor, i: { submissionId: string; grade: number; feedback: string }) {
      return ctx.as(a, 'homework.manage', async (tx, m) => {
        const [s] = await tx.query<{ studentId: string; groupId: string; title: string }>(
          'select s.student_id, h.group_id, h.title from submissions s join homework h on h.id = s.homework_id where s.id = $1', [i.submissionId]);
        if (!s) throw new DomainError('NOT_FOUND', 'Submission not found');
        await ctx.assertGroupAccess(tx, m, s.groupId);
        await tx.query('update submissions set grade = $2, feedback = $3, graded_at = $4, graded_by = $5 where id = $1', [i.submissionId, i.grade, i.feedback, ctx.now().toISOString(), m.userId]);
        const [st] = await tx.query<{ fullName: string }>('select full_name from students where id = $1', [s.studentId]);
        const notified = await ctx.notifyFamily(tx, m.centreId, s.studentId, 'homework_graded', { student: st!.fullName, title: s.title, grade: i.grade, feedback: i.feedback }, { alsoStudent: true });
        return { ok: true, notified };
      });
    },

    /** Grades and attendance over time, for the student/parent charts and the staff profile. */
    async 'progress.student'(a: Actor, i: { studentId?: string | null }) {
      const self = selfRole(a);
      return ctx.as(a, self ? 'self.read' : 'students.read', async (tx, m) => {
        const sid = self ? await ctx.ownStudent(tx, m, i.studentId) : i.studentId;
        if (!sid) throw new DomainError('VALIDATION', 'studentId required');
        const [st] = await tx.query<{ fullName: string }>('select full_name from students where id = $1', [sid]);
        if (!st) throw new DomainError('NOT_FOUND', 'Student not found');
        const homework = await tx.query<{ date: string; title: string; grade: number }>(
          `select to_char(s.graded_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as date, h.title, s.grade from submissions s join homework h on h.id = s.homework_id
           where s.student_id = $1 and s.grade is not null order by s.graded_at`, [sid]);
        const tests = await tx.query<{ date: string; title: string; score: number }>(
          `select to_char(a.submitted_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as date, t.title, a.score from test_attempts a join tests t on t.id = a.test_id
           where a.student_id = $1 order by a.submitted_at`, [sid]);
        const att = await tx.query<{ month: string; present: number; late: number; absent: number; excused: number }>(
          `select to_char(date, 'YYYY-MM') as month, count(*) filter (where status = 'present')::int as present, count(*) filter (where status = 'late')::int as late,
                  count(*) filter (where status = 'absent')::int as absent, count(*) filter (where status = 'excused')::int as excused
           from attendance where student_id = $1 group by 1 order by 1`, [sid]);
        const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
        return { studentId: sid, fullName: st.fullName, homework, tests, attendance: att, averages: { homework: avg(homework.map((h) => h.grade)), tests: avg(tests.map((t) => t.score)) }, month: monthOf(ctx.today()) };
      });
    },
  };
}
