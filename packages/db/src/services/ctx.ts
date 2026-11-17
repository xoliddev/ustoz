/**
 * Application-service context: tenant-scoped transactions, the permission gate, ownership checks,
 * the audit log and the transactional outbox (bot notifications are written in the same transaction
 * as the change that caused them, so "absent" and "parent notified" can never disagree).
 */
import {
  DomainError, isManager, requirePermission, todayIn, uuidv7, type Clock, type IsoDate, type Permission, type Role, type TestGenerator,
} from '@ustoz/core';
import { inScope, json, type Database, type Sql } from '../client';

export type Locale = 'uz' | 'ru' | 'en';

export interface Actor {
  userId: string | null;
  telegramId: number | null;
  locale: Locale;
  centreId: string | null;
  role: Role | null;
}

export const SYSTEM: Actor = { userId: null, telegramId: null, locale: 'uz', centreId: null, role: null };
export const ANON: Actor = SYSTEM;

export interface PaymentsPort {
  /** Sandbox checkout info for a pending payment (URL/params the client would open). */
  checkout(provider: 'payme' | 'click' | 'uzum', p: { paymentId: string; amount: number; centreId: string }): { url: string; params: Record<string, string | number> };
}

export interface BackendDeps {
  db: Database;
  clock: Clock;
  /** HMAC key for certificate signatures. */
  certSecret: string;
  /** Public base URL for certificate QR links, e.g. https://example.com/#/verify/ */
  verifyBase: string;
  testGenerator: TestGenerator;
  payments?: PaymentsPort;
  /** Called after a transaction that wrote outbox rows commits (nudges the deliverer / demo bot chat). */
  onOutbox?: () => void;
}

export interface Member {
  centreId: string;
  role: Role;
  personId: string | null;
  userId: string;
}

export class Ctx {
  readonly db: Database;
  readonly deps: BackendDeps;
  private pendingOutbox = false;

  constructor(deps: BackendDeps) {
    this.db = deps.db;
    this.deps = deps;
  }

  now(): Date {
    return this.deps.clock.now();
  }

  today(): IsoDate {
    return todayIn(this.now());
  }

  async tx<T>(centreId: string | null, actor: Actor, fn: (tx: Sql) => Promise<T>): Promise<T> {
    const out = await inScope(this.db, { centreId, userId: actor.userId }, fn);
    if (this.pendingOutbox) {
      this.pendingOutbox = false;
      this.deps.onOutbox?.();
    }
    return out;
  }

  /**
   * The gate every method passes: the actor must be signed in, still hold the claimed role in the claimed
   * centre (checked against the members table, not trusted from the token), and that role must grant `perm`.
   */
  async as<T>(actor: Actor, perm: Permission, fn: (tx: Sql, m: Member) => Promise<T>): Promise<T> {
    if (!actor.userId || !actor.centreId || !actor.role) throw new DomainError('UNAUTHENTICATED');
    requirePermission(actor.role, perm);
    const userId = actor.userId;
    return this.tx(actor.centreId, actor, async (tx) => {
      const [row] = await tx.query<{ personId: string | null }>('select person_id from members where centre_id = $1 and user_id = $2 and role = $3', [actor.centreId, userId, actor.role]);
      if (!row) throw new DomainError('FORBIDDEN', 'Not a member of this centre');
      return fn(tx, { centreId: actor.centreId!, role: actor.role!, personId: row.personId, userId });
    });
  }

  /** Teachers may only touch their own groups; directors and admins any group of the centre. */
  async assertGroupAccess(tx: Sql, m: Member, groupId: string): Promise<void> {
    const [g] = await tx.query<{ teacherId: string | null }>('select teacher_id from groups where id = $1', [groupId]);
    if (!g) throw new DomainError('NOT_FOUND', 'Group not found');
    if (isManager(m.role)) return;
    if (m.role === 'teacher' && g.teacherId === m.personId) return;
    throw new DomainError('FORBIDDEN', 'Not your group');
  }

  /** Students the caller may see: self (student) or own children (parent). */
  async ownStudents(tx: Sql, m: Member): Promise<string[]> {
    if (m.role === 'student') return m.personId ? [m.personId] : [];
    if (m.role === 'parent') return (await tx.query<{ studentId: string }>('select student_id from student_parents where parent_id = $1 order by student_id', [m.personId])).map((r) => r.studentId);
    return [];
  }

  /** Resolves the student a student/parent asks about, refusing anyone else's child. */
  async ownStudent(tx: Sql, m: Member, studentId?: string | null): Promise<string> {
    const own = await this.ownStudents(tx, m);
    const id = studentId ?? own[0];
    if (!id || !own.includes(id)) throw new DomainError('FORBIDDEN', 'Not your student');
    return id;
  }

  async audit(tx: Sql, m: Member, action: string, entity: string, entityId: string | null, data: unknown = {}): Promise<void> {
    await tx.query('insert into audit_log (centre_id, id, actor_user_id, actor_role, action, entity, entity_id, data, at) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)', [
      m.centreId, uuidv7(this.now().getTime()), m.userId, m.role, action, entity, entityId, json(data), this.now().toISOString(),
    ]);
  }

  /** Queues a bot message to every parent of a student (and the student when `alsoStudent`). */
  async notifyFamily(tx: Sql, centreId: string, studentId: string, template: string, params: Record<string, unknown>, opts: { alsoStudent?: boolean } = {}): Promise<number> {
    const rows = await tx.query<{ kind: 'parent' | 'student'; id: string; telegramId: number | null; locale: string }>(
      `select 'parent' as kind, p.id, p.telegram_id, p.locale from student_parents sp join parents p on p.id = sp.parent_id where sp.student_id = $1
       union all select 'student', s.id, s.telegram_id, s.locale from students s where s.id = $1 and $2::boolean`,
      [studentId, !!opts.alsoStudent],
    );
    for (const r of rows) await this.enqueue(tx, centreId, { kind: r.kind, id: r.id, telegramId: r.telegramId, locale: r.locale }, template, params);
    return rows.length;
  }

  async enqueue(tx: Sql, centreId: string, to: { kind: 'student' | 'parent' | 'teacher' | 'staff'; id: string; telegramId: number | null; locale: string }, template: string, params: Record<string, unknown>): Promise<void> {
    await tx.query('insert into outbox (centre_id, id, recipient_tg, recipient_kind, recipient_id, template, params, locale, created_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)', [
      centreId, uuidv7(this.now().getTime()), to.telegramId, to.kind, to.id, template, json(params), to.locale, this.now().toISOString(),
    ]);
    this.pendingOutbox = true;
  }
}

export const toLoc = (v: string | null | undefined): Locale => (v === 'ru' || v === 'en' ? v : 'uz');

export function clampLimit(v: number | undefined, d = 50, max = 500): number {
  return Math.max(1, Math.min(max, Math.floor(v ?? d)));
}
