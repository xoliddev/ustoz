/** Certificates (signed, publicly verifiable), the director dashboard and the notification feed. */
import {
  addDays, addMonths, attendanceRate, DomainError, fnv1a, humanCode, monthOf, rng, signCertificate, uuidv7, verifyCertificate, type AttendanceStatus, type Month,
} from '@ustoz/core';
import { balances } from './billing-core';
import type { Actor, Ctx } from './ctx';
import { listStudents } from './students';

export function insightsService(ctx: Ctx) {
  return {
    async 'certificates.issue'(a: Actor, i: { studentId: string; courseId: string; level: string }) {
      return ctx.as(a, 'certificates.issue', async (tx, m) => {
        const [s] = await tx.query<{ fullName: string }>('select full_name from students where id = $1', [i.studentId]);
        const [c] = await tx.query<{ name: string }>('select name from courses where id = $1', [i.courseId]);
        const [centre] = await tx.query<{ name: string }>('select name from centres where id = $1', [m.centreId]);
        if (!s || !c) throw new DomainError('NOT_FOUND', 'Student or course not found');
        const id = uuidv7(ctx.now().getTime());
        const code = humanCode(rng(fnv1a(id)), 8);
        const fields = { code, studentName: s.fullName, courseName: c.name, level: i.level, issuedOn: ctx.today(), centreName: centre!.name };
        const signature = await signCertificate(ctx.deps.certSecret, fields);
        await tx.query(
          'insert into certificates (centre_id, id, code, student_id, course_id, student_name, course_name, level, issued_on, centre_name, signature) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [m.centreId, id, code, i.studentId, i.courseId, fields.studentName, fields.courseName, fields.level, fields.issuedOn, fields.centreName, signature],
        );
        await ctx.audit(tx, m, 'certificate.issue', 'certificate', id, { code });
        await ctx.notifyFamily(tx, m.centreId, i.studentId, 'certificate_issued', { student: s.fullName, course: c.name, level: i.level, url: `${ctx.deps.verifyBase}${code}` }, { alsoStudent: true });
        return { id, ...fields, signature, url: `${ctx.deps.verifyBase}${code}` };
      });
    },

    async 'certificates.list'(a: Actor, i: { studentId?: string | null }) {
      return ctx.as(a, 'certificates.read', async (tx, m) => {
        const own = m.role === 'student' || m.role === 'parent' ? await ctx.ownStudents(tx, m) : null;
        const rows = await tx.query<{ id: string; code: string; studentId: string; studentName: string; courseName: string; level: string; issuedOn: string; centreName: string; signature: string }>(
          `select id, code, student_id, student_name, course_name, level, issued_on, centre_name, signature from certificates
           where not revoked and ($1::uuid[] is null or student_id = any($1::uuid[])) and ($2::uuid is null or student_id = $2) order by issued_on desc`,
          [own, i.studentId ?? null],
        );
        return rows.map((r) => ({ ...r, url: `${ctx.deps.verifyBase}${r.code}` }));
      });
    },

    /** Public: anyone with the QR code can check a certificate is real and unaltered. */
    async 'certificates.verify'(_a: Actor, i: { code: string }) {
      const [r] = await ctx.tx(null, { userId: null, telegramId: null, locale: 'uz', centreId: null, role: null }, (tx) =>
        tx.query<{ code: string; studentName: string; courseName: string; level: string; issuedOn: string; centreName: string; signature: string; revoked: boolean }>('select * from verify_certificate($1)', [i.code]),
      );
      if (!r) return { valid: false as const };
      const ok = !r.revoked && (await verifyCertificate(ctx.deps.certSecret, r, r.signature));
      const { signature: _s, ...pub } = r;
      return ok ? { valid: true as const, certificate: pub } : { valid: false as const };
    },

    async 'dashboard.summary'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'dashboard.read', async (tx, m) => {
        const today = ctx.today();
        const month: Month = monthOf(today);
        const months = Array.from({ length: 6 }, (_, k) => addMonths(month, k - 5));
        const revenue = await tx.query<{ month: string; collected: number }>(
          `select to_char(paid_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month, sum(amount)::bigint as collected from payments
           where status = 'paid' and paid_at >= ($1 || '-01')::date - interval '1 day' group by 1`, [months[0]]);
        const billed = await tx.query<{ month: string; billed: number }>('select month, sum(total)::bigint as billed from invoices where month >= $1 group by 1', [months[0]]);
        const rev = months.map((mo) => ({ month: mo, collected: revenue.find((r) => r.month === mo)?.collected ?? 0, billed: billed.find((b) => b.month === mo)?.billed ?? 0 }));
        const att = await tx.query<{ date: string; status: AttendanceStatus }>('select date, status from attendance where date > $1::date and date <= $2::date', [addDays(today, -28), today]);
        const weeks = [3, 2, 1, 0].map((w) => {
          const from = addDays(today, -7 * (w + 1) + 1);
          const to = addDays(today, -7 * w);
          return { from, to, rate: attendanceRate(att.filter((x) => x.date >= from && x.date <= to).map((x) => x.status)) };
        });
        const students = await listStudents(tx, today, m);
        const active = students.filter((s) => s.groups.length > 0);
        const money = await balances(tx, null, today);
        let debt = 0;
        let debtors = 0;
        for (const b of money.values()) if (b.debt > 0) { debt += b.debt; debtors++; }
        const risk = active.filter((s) => s.risk.level === 'high').sort((x, y) => y.risk.score - x.risk.score).slice(0, 8)
          .map((s) => ({ id: s.id, fullName: s.fullName, groups: s.groups.map((g) => g.name), reasons: s.risk.reasons, score: s.risk.score, streak: s.streak, overdue: s.overdue }));
        const load = await tx.query<{ id: string; fullName: string; color: string; groups: number; students: number; minutes: number }>(
          `select t.id, t.full_name, t.color, count(distinct g.id)::int as groups,
                  count(e.id)::int as students,
                  coalesce((select sum((g2.end_min - g2.start_min) * array_length(g2.days, 1)) from groups g2 where g2.teacher_id = t.id and g2.status = 'active'), 0)::int as minutes
           from teachers t left join groups g on g.teacher_id = t.id and g.status = 'active'
           left join enrollments e on e.group_id = g.id and e.left_on is null where t.active group by t.id order by minutes desc`);
        const [leads] = await tx.query<{ open: number; enrolled30: number; new7: number }>(
          `select count(*) filter (where stage in ('new','placement','trial'))::int as open,
                  count(*) filter (where stage = 'enrolled' and updated_at >= $1)::int as enrolled30,
                  count(*) filter (where created_at >= $2)::int as new7 from leads`,
          [new Date(ctx.now().getTime() - 30 * 86_400_000).toISOString(), new Date(ctx.now().getTime() - 7 * 86_400_000).toISOString()]);
        const rateNow = weeks[3]!.rate;
        return {
          today, month, revenue: rev, debt, debtors, attendance: { weeks, rate: rateNow }, activeStudents: active.length,
          risk, riskCount: active.filter((s) => s.risk.level === 'high').length, load, leads: leads!,
        };
      });
    },

    /** Bot messages addressed to the caller (the demo's simulated chat reads its feed from here). */
    async 'notifications.mine'(a: Actor, i: { since?: string | null; personId?: string | null }) {
      return ctx.as(a, 'outbox.read', async (tx, m) => {
        const pid = m.personId;
        if (!pid) return [];
        return tx.query<{ id: string; template: string; params: Record<string, unknown>; locale: string; createdAt: string }>(
          `select id, template, params, locale, created_at from outbox where recipient_id = $1 and ($2::timestamptz is null or created_at > $2) order by created_at, id limit 200`,
          [pid, i.since ?? null],
        );
      });
    },
  };
}
