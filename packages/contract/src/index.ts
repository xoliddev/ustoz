/**
 * @ustoz/contract — one table for the whole API surface: method name → zod input schema + who may call it
 * + rate-limit group. The Fastify server registers POST /v1/<method> from it, the HTTP client builds
 * requests from it, and the demo's in-browser backend validates with it, so all three agree by construction.
 * Output types are inferred from the backend (type-only import).
 */
import { z } from 'zod';
import { isIsoDate, isMonth, MAX_TIYIN } from '@ustoz/core';
import type { MethodInput, MethodName, MethodOutput } from '@ustoz/db';

const uuid = z.string().uuid();
const date = z.string().refine(isIsoDate, 'Invalid date (YYYY-MM-DD)');
const month = z.string().refine(isMonth, 'Invalid month (YYYY-MM)');
const money = z.number().int().min(0).max(MAX_TIYIN);
const positive = z.number().int().min(1).max(MAX_TIYIN);
const name = z.string().trim().min(2).max(120);
const phone = z.string().trim().min(7).max(25);
const bp = z.number().int().min(0).max(10_000);
const empty = z.object({}).strict();
const locale = z.enum(['uz', 'ru', 'en']);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const question = z.object({ id: z.string().max(20), prompt: z.string().min(1).max(400), options: z.array(z.string().min(1).max(160)).min(2).max(6), answer: z.number().int().min(0).max(5), explanation: z.string().max(300).optional() });

const groupInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(60),
  courseId: uuid,
  teacherId: uuid.nullable(),
  roomId: uuid.nullable(),
  branchId: uuid,
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  startsOn: date,
  endsOn: date.nullable(),
  monthlyFee: money.optional(),
  capacity: z.number().int().min(1).max(200),
});

export type RateGroup = 'auth' | 'write' | 'ai' | 'public' | 'default';
export interface RouteDef {
  input: z.ZodType;
  /** 'user' needs a signed-in member; 'public' is open (certificate check) and strictly rate-limited. */
  auth: 'user' | 'public';
  rate?: RateGroup;
}

const r = (input: z.ZodType, extra: Partial<RouteDef> = {}): RouteDef => ({ input, auth: 'user', ...extra });

export const ROUTES = {
  me: r(empty),
  'org.structure': r(empty),
  'courses.save': r(z.object({ id: uuid.optional(), name, subject: z.string().trim().min(1).max(60), level: z.string().max(40), monthlyFee: money, durationMonths: z.number().int().min(1).max(48), color }), { rate: 'write' }),
  'teachers.salary': r(z.object({ teacherId: uuid, scheme: z.enum(['fixed', 'per_student', 'percent']), amount: money, bp }), { rate: 'write' }),
  'groups.list': r(empty),
  'groups.get': r(z.object({ groupId: uuid })),
  'groups.checkConflicts': r(groupInput),
  'groups.save': r(groupInput, { rate: 'write' }),
  'groups.enroll': r(z.object({ groupId: uuid, studentId: uuid, joinedOn: date, customBp: bp.optional() }), { rate: 'write' }),
  'groups.unenroll': r(z.object({ enrollmentId: uuid, leftOn: date }), { rate: 'write' }),
  'schedule.week': r(z.object({ weekOf: date.optional(), branchId: uuid.nullish() })),
  'family.children': r(empty),
  'students.list': r(empty),
  'students.get': r(z.object({ studentId: uuid })),
  'students.create': r(z.object({ fullName: name, phone: phone.nullish(), birthYear: z.number().int().min(1940).max(2030).nullish(), parent: z.object({ fullName: name, phone }).nullish() }), { rate: 'write' }),
  'attendance.today': r(z.object({ date: date.optional() })),
  'attendance.sheet': r(z.object({ groupId: uuid, date })),
  'attendance.mark': r(z.object({ groupId: uuid, date, marks: z.array(z.object({ studentId: uuid, status: z.enum(['present', 'late', 'absent', 'excused']) })).min(1).max(200) }), { rate: 'write' }),
  'leads.list': r(empty),
  'leads.stats': r(z.object({ days: z.number().int().min(1).max(365).optional() })),
  'leads.create': r(z.object({ fullName: name, phone, courseId: uuid.nullish(), source: z.enum(['instagram', 'telegram', 'referral', 'google', 'walk_in']), notes: z.string().max(1000).optional() }), { rate: 'write' }),
  'leads.move': r(z.object({ leadId: uuid, to: z.enum(['new', 'placement', 'trial', 'lost']), lostReason: z.string().max(200).optional() }), { rate: 'write' }),
  'leads.placement': r(z.object({ leadId: uuid, score: z.number().int().min(0).max(100) }), { rate: 'write' }),
  'leads.trial': r(z.object({ leadId: uuid, groupId: uuid, date }), { rate: 'write' }),
  'leads.enroll': r(z.object({ leadId: uuid, groupId: uuid.optional(), parent: z.object({ fullName: name, phone }).nullish() }), { rate: 'write' }),
  'billing.run': r(z.object({ month }), { rate: 'write' }),
  'billing.overview': r(z.object({ month })),
  'billing.debtors': r(empty),
  'billing.remind': r(z.object({ studentIds: z.array(uuid).max(500).optional() }), { rate: 'write' }),
  'billing.statement': r(z.object({ studentId: uuid.optional() })),
  'payments.record': r(z.object({ studentId: uuid, amount: positive, method: z.enum(['cash', 'card', 'transfer']), note: z.string().max(200).optional() }), { rate: 'write' }),
  'payments.prepayQuote': r(z.object({ enrollmentId: uuid, months: z.number().int().min(1).max(12) })),
  'payments.prepay': r(z.object({ enrollmentId: uuid, months: z.number().int().min(1).max(12), method: z.enum(['cash', 'card', 'transfer']) }), { rate: 'write' }),
  'payments.receipt': r(z.object({ paymentId: uuid })),
  'payments.checkout': r(z.object({ studentId: uuid.optional(), amount: positive, provider: z.enum(['payme', 'click', 'uzum']) }), { rate: 'write' }),
  'payments.status': r(z.object({ paymentId: uuid })),
  'payroll.report': r(z.object({ month })),
  'payroll.mine': r(z.object({ month })),
  'homework.mine': r(z.object({ studentId: uuid.nullish() })),
  'homework.list': r(z.object({ groupId: uuid.nullish() })),
  'homework.create': r(z.object({ groupId: uuid, title: z.string().trim().min(2).max(120), description: z.string().max(2000), dueOn: date }), { rate: 'write' }),
  'homework.submissions': r(z.object({ homeworkId: uuid })),
  'homework.submit': r(z.object({ homeworkId: uuid, kind: z.enum(['text', 'photo', 'file']), body: z.string().max(4000), fileName: z.string().max(120).nullish(), fileData: z.string().max(1_500_000).nullish() }), { rate: 'write' }),
  'homework.grade': r(z.object({ submissionId: uuid, grade: z.number().int().min(0).max(100), feedback: z.string().max(500) }), { rate: 'write' }),
  'progress.student': r(z.object({ studentId: uuid.nullish() })),
  'tests.generate': r(z.object({ topic: z.string().max(120).optional(), text: z.string().max(12_000).optional(), count: z.number().int().min(3).max(20) }), { rate: 'ai' }),
  'tests.publish': r(z.object({ groupId: uuid, title: z.string().trim().min(2).max(120), topic: z.string().max(120), source: z.enum(['local', 'gemini', 'claude']), questions: z.array(question).min(1).max(30) }), { rate: 'write' }),
  'tests.mine': r(empty),
  'tests.list': r(z.object({ groupId: uuid.nullish() })),
  'tests.get': r(z.object({ testId: uuid })),
  'tests.submit': r(z.object({ testId: uuid, answers: z.record(z.string().max(20), z.number().int().min(0).max(5).nullable()), durationSec: z.number().min(0).max(86_400) }), { rate: 'write' }),
  'tests.leaderboard': r(z.object({ testId: uuid })),
  'certificates.issue': r(z.object({ studentId: uuid, courseId: uuid, level: z.string().trim().min(1).max(40) }), { rate: 'write' }),
  'certificates.list': r(z.object({ studentId: uuid.nullish() })),
  'certificates.verify': r(z.object({ code: z.string().regex(/^[A-Za-z0-9]{6,12}$/) }), { auth: 'public', rate: 'public' }),
  'dashboard.summary': r(empty),
  'notifications.mine': r(z.object({ since: z.string().datetime({ offset: true }).nullish() })),
  'bot.state': r(empty),
  'bot.saveState': r(z.object({ state: z.object({ awaitingHomework: z.object({ id: uuid, title: z.string().max(200) }).nullish(), locale: locale.optional() }) })),
  'bot.setLocale': r(z.object({ locale })),
} satisfies Record<MethodName, RouteDef>;

export type RouteName = keyof typeof ROUTES;
export type Input<K extends RouteName> = K extends MethodName ? MethodInput<K> : never;
export type Output<K extends RouteName> = K extends MethodName ? MethodOutput<K> : never;

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details: Record<string, unknown> = {}, readonly status = 400) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Parses an input against its route schema; throws ApiError('VALIDATION') naming the first bad field. */
export function validate<K extends RouteName>(name: K, input: unknown): Input<K> {
  const def = ROUTES[name] as RouteDef | undefined;
  if (!def) throw new ApiError('NOT_FOUND', `Unknown method ${String(name)}`, {}, 404);
  const res = def.input.safeParse(input ?? {});
  if (!res.success) {
    const issue = res.error.issues[0];
    throw new ApiError('VALIDATION', issue?.message ?? 'Invalid input', { field: issue?.path.join('.') ?? '' }, 400);
  }
  return res.data as Input<K>;
}

export const isRoute = (n: string): n is RouteName => Object.prototype.hasOwnProperty.call(ROUTES, n);
