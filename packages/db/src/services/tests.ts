/** Generated multiple-choice tests: generate → publish to a group → students take them in the Mini App → leaderboard. */
import { DomainError, gradeAttempt, isManager, sanitizeQuestions, uuidv7, type Question } from '@ustoz/core';
import { json } from '../client';
import type { Actor, Ctx } from './ctx';
import { notifyGroupStudents, studentGroups } from './learning';

export function testsService(ctx: Ctx) {
  return {
    /** Preview only: nothing is stored until the teacher publishes. */
    async 'tests.generate'(a: Actor, i: { topic?: string; text?: string; count: number }) {
      return ctx.as(a, 'tests.manage', async () => {
        if (!i.topic?.trim() && !i.text?.trim()) throw new DomainError('VALIDATION', 'Give a topic or paste a text', { field: 'topic' });
        return ctx.deps.testGenerator.generate({ topic: i.topic, text: i.text, count: i.count, locale: a.locale });
      });
    },

    async 'tests.publish'(a: Actor, i: { groupId: string; title: string; topic: string; source: string; questions: Question[] }) {
      return ctx.as(a, 'tests.manage', async (tx, m) => {
        await ctx.assertGroupAccess(tx, m, i.groupId);
        const questions = sanitizeQuestions(i.questions);
        const id = uuidv7(ctx.now().getTime());
        await tx.query('insert into tests (centre_id, id, group_id, title, topic, source, questions, created_by, created_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)', [
          m.centreId, id, i.groupId, i.title, i.topic, i.source, json(questions), m.userId, ctx.now().toISOString(),
        ]);
        const notified = await notifyGroupStudents(ctx, tx, m.centreId, i.groupId, 'test_new', { title: i.title, questions: questions.length });
        return { id, notified };
      });
    },

    async 'tests.mine'(a: Actor, _i: Record<string, never>) {
        return ctx.as(a, 'tests.take', async (tx, m) => {
          const sid = await ctx.ownStudent(tx, m, null);
          return tx.query<{ id: string; title: string; topic: string; groupName: string; questions: number; createdAt: string; score: number | null; attempted: boolean }>(
            `select t.id, t.title, t.topic, g.name as group_name, jsonb_array_length(t.questions) as questions, t.created_at, a.score, a.id is not null as attempted
             from tests t join groups g on g.id = t.group_id left join test_attempts a on a.test_id = t.id and a.student_id = $1
             where t.group_id = any($2::uuid[]) and t.status = 'published' order by t.created_at desc`,
            [sid, await studentGroups(tx, sid)],
          );
        });
    },

    async 'tests.list'(a: Actor, i: { groupId?: string | null }) {
      return ctx.as(a, 'tests.manage', async (tx, m) => {
        if (i.groupId) await ctx.assertGroupAccess(tx, m, i.groupId);
        return tx.query<{ id: string; title: string; topic: string; groupName: string; questions: number; createdAt: string; attempts: number; avg: number | null; source: string }>(
          `select t.id, t.title, t.topic, g.name as group_name, jsonb_array_length(t.questions) as questions, t.created_at, t.source,
                  (select count(*)::int from test_attempts x where x.test_id = t.id) as attempts, (select round(avg(score))::int from test_attempts x where x.test_id = t.id) as avg
           from tests t join groups g on g.id = t.group_id
           where ($1::uuid is null or t.group_id = $1) and ($2::boolean or g.teacher_id = $3) order by t.created_at desc`,
          [i.groupId ?? null, isManager(m.role), m.personId],
        );
      });
    },

    /** The test as a student sees it: no answers. */
    async 'tests.get'(a: Actor, i: { testId: string }) {
      return ctx.as(a, 'tests.take', async (tx, m) => {
        const sid = await ctx.ownStudent(tx, m, null);
        const [t] = await tx.query<{ id: string; title: string; groupId: string; questions: Question[] }>('select id, title, group_id, questions from tests where id = $1 and status = $2', [i.testId, 'published']);
        if (!t || !(await studentGroups(tx, sid)).includes(t.groupId)) throw new DomainError('NOT_FOUND', 'Test not found');
        const [done] = await tx.query('select 1 from test_attempts where test_id = $1 and student_id = $2', [i.testId, sid]);
        return { id: t.id, title: t.title, attempted: !!done, questions: t.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) };
      });
    },

    async 'tests.submit'(a: Actor, i: { testId: string; answers: Record<string, number | null>; durationSec: number }) {
      return ctx.as(a, 'tests.take', async (tx, m) => {
        const sid = await ctx.ownStudent(tx, m, null);
        const [t] = await tx.query<{ title: string; groupId: string; questions: Question[] }>('select title, group_id, questions from tests where id = $1 and status = $2', [i.testId, 'published']);
        if (!t || !(await studentGroups(tx, sid)).includes(t.groupId)) throw new DomainError('NOT_FOUND', 'Test not found');
        const r = gradeAttempt(t.questions, i.answers);
        const inserted = await tx.query(
          `insert into test_attempts (centre_id, id, test_id, student_id, answers, correct, total, score, duration_sec, submitted_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
           on conflict (test_id, student_id) do nothing returning id`,
          [m.centreId, uuidv7(ctx.now().getTime()), i.testId, sid, json(i.answers), r.correct, r.total, r.score, Math.max(0, Math.min(86_400, Math.round(i.durationSec))), ctx.now().toISOString()],
        );
        if (!inserted.length) throw new DomainError('CONFLICT', 'You already took this test', { reason: 'ALREADY_TAKEN' });
        return { ...r, review: t.questions.map((q) => ({ id: q.id, answer: q.answer, explanation: q.explanation ?? null })) };
      });
    },

    async 'tests.leaderboard'(a: Actor, i: { testId: string }) {
      const perm = a.role === 'student' ? 'tests.take' : 'tests.manage';
      return ctx.as(a, perm, async (tx, m) => {
        const [t] = await tx.query<{ groupId: string; title: string }>('select group_id, title from tests where id = $1', [i.testId]);
        if (!t) throw new DomainError('NOT_FOUND', 'Test not found');
        let me: string | null = null;
        if (m.role === 'student') {
          me = await ctx.ownStudent(tx, m, null);
          if (!(await studentGroups(tx, me)).includes(t.groupId)) throw new DomainError('NOT_FOUND', 'Test not found');
        } else await ctx.assertGroupAccess(tx, m, t.groupId);
        const rows = await tx.query<{ studentId: string; fullName: string; score: number; correct: number; total: number; durationSec: number }>(
          `select a.student_id, s.full_name, a.score, a.correct, a.total, a.duration_sec from test_attempts a join students s on s.id = a.student_id
           where a.test_id = $1 order by a.score desc, a.duration_sec asc, s.full_name`, [i.testId]);
        // students see classmates' first names only
        const shown = rows.map((r, n) => ({ rank: n + 1, ...r, fullName: m.role === 'student' && r.studentId !== me ? r.fullName.split(' ')[0]! : r.fullName, isMe: r.studentId === me }));
        return { title: t.title, rows: shown };
      });
    },
  };
}
