/** Sign-in, memberships, and the centre's structure: branches, rooms, teachers, courses. */
import { DomainError, ROLES, uuidv7, type Role, type SalaryScheme, type TelegramUser } from '@ustoz/core';
import type { Sql } from '../client';
import { toLoc, type Actor, type Ctx } from './ctx';

export interface Membership {
  centreId: string;
  centreName: string;
  role: Role;
  personId: string | null;
}

export interface UserRow {
  id: string;
  telegramId: number;
  firstName: string;
  languageCode: string;
}

const ROLE_ORDER = (r: Role) => ROLES.indexOf(r);

export async function upsertTelegramUser(ctx: Ctx, u: TelegramUser): Promise<{ user: UserRow; memberships: Membership[] }> {
  const [r] = await ctx.tx(null, { userId: null, telegramId: u.id, locale: 'uz', centreId: null, role: null }, (tx) =>
    tx.query<{ id: string }>('select upsert_user($1,$2,$3,$4,$5,$6) as id', [u.id, u.first_name, u.last_name ?? null, u.username ?? null, toLoc(u.language_code), uuidv7(ctx.now().getTime())]),
  );
  const userId = r!.id;
  return loadUser(ctx, userId);
}

export async function loadUser(ctx: Ctx, userId: string): Promise<{ user: UserRow; memberships: Membership[] }> {
  const actor: Actor = { userId, telegramId: null, locale: 'uz', centreId: null, role: null };
  return ctx.tx(null, actor, async (tx) => {
    const [user] = await tx.query<UserRow>('select id, telegram_id, first_name, language_code from users where id = $1', [userId]);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    const memberships = await tx.query<Membership>(
      'select m.centre_id, c.name as centre_name, m.role, m.person_id from members m join centres c on c.id = m.centre_id where m.user_id = $1',
      [userId],
    );
    memberships.sort((a, b) => ROLE_ORDER(a.role) - ROLE_ORDER(b.role));
    return { user, memberships };
  });
}

/** Picks the requested membership (or the most privileged one) and builds the Actor for it. */
export function actorFor(user: UserRow, memberships: Membership[], want?: { centreId?: string; role?: Role }): Actor {
  const m = memberships.find((x) => (!want?.centreId || x.centreId === want.centreId) && (!want?.role || x.role === want.role)) ?? (want ? undefined : memberships[0]);
  if (want && !m) throw new DomainError('FORBIDDEN', 'No such membership');
  return { userId: user.id, telegramId: user.telegramId, locale: toLoc(user.languageCode), centreId: m?.centreId ?? null, role: m?.role ?? null };
}

async function personName(tx: Sql, role: Role, personId: string | null): Promise<string | null> {
  if (!personId) return null;
  const table = role === 'teacher' ? 'teachers' : role === 'student' ? 'students' : role === 'parent' ? 'parents' : null;
  if (!table) return null;
  const [r] = await tx.query<{ fullName: string }>(`select full_name from ${table} where id = $1`, [personId]);
  return r?.fullName ?? null;
}

export function orgService(ctx: Ctx) {
  return {
    async me(a: Actor, _i: Record<string, never>) {
      if (!a.userId) throw new DomainError('UNAUTHENTICATED');
      const { user, memberships } = await loadUser(ctx, a.userId);
      if (!a.centreId || !a.role) return { user, memberships, centre: null, role: null, personId: null, personName: null, today: ctx.today() };
      return ctx.as(a, a.role === 'student' || a.role === 'parent' ? 'self.read' : 'certificates.read', async (tx, m) => {
        const [centre] = await tx.query<{ id: string; name: string; slug: string; settings: Record<string, unknown> }>('select id, name, slug, settings from centres where id = $1', [m.centreId]);
        return { user, memberships, centre: centre!, role: m.role, personId: m.personId, personName: (await personName(tx, m.role, m.personId)) ?? user.firstName, today: ctx.today() };
      });
    },

    async 'org.structure'(a: Actor, _i: Record<string, never>) {
      return ctx.as(a, 'groups.read', async (tx) => ({
        branches: await tx.query<{ id: string; name: string; address: string }>('select id, name, address from branches order by name'),
        rooms: await tx.query<{ id: string; branchId: string; name: string; capacity: number }>('select id, branch_id, name, capacity from rooms order by name'),
        teachers: await tx.query<{ id: string; fullName: string; phone: string | null; subjects: string[]; color: string; active: boolean; salaryScheme: SalaryScheme; salaryAmount: number; salaryBp: number }>(
          'select id, full_name, phone, subjects, color, active, salary_scheme, salary_amount, salary_bp from teachers order by full_name',
        ),
        courses: await tx.query<{ id: string; name: string; subject: string; level: string; monthlyFee: number; durationMonths: number; color: string }>(
          'select id, name, subject, level, monthly_fee, duration_months, color from courses order by name',
        ),
      }));
    },

    async 'courses.save'(a: Actor, i: { id?: string; name: string; subject: string; level: string; monthlyFee: number; durationMonths: number; color: string }) {
      return ctx.as(a, 'courses.manage', async (tx, m) => {
        const id = i.id ?? uuidv7(ctx.now().getTime());
        await tx.query(
          `insert into courses (centre_id, id, name, subject, level, monthly_fee, duration_months, color) values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (id) do update set name = excluded.name, subject = excluded.subject, level = excluded.level, monthly_fee = excluded.monthly_fee,
             duration_months = excluded.duration_months, color = excluded.color`,
          [m.centreId, id, i.name, i.subject, i.level, i.monthlyFee, i.durationMonths, i.color],
        );
        await ctx.audit(tx, m, i.id ? 'course.update' : 'course.create', 'course', id, { name: i.name, monthlyFee: i.monthlyFee });
        return { id };
      });
    },

    async 'teachers.salary'(a: Actor, i: { teacherId: string; scheme: SalaryScheme; amount: number; bp: number }) {
      return ctx.as(a, 'salary.manage', async (tx, m) => {
        const r = await tx.query('update teachers set salary_scheme = $2, salary_amount = $3, salary_bp = $4 where id = $1 returning id', [i.teacherId, i.scheme, i.amount, i.bp]);
        if (!r.length) throw new DomainError('NOT_FOUND', 'Teacher not found');
        await ctx.audit(tx, m, 'teacher.salary', 'teacher', i.teacherId, i);
        return { ok: true };
      });
    },
  };
}
