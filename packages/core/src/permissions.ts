/**
 * Role → permission matrix. Every backend method calls `requirePermission` first; methods that touch a
 * single group or child also check ownership (a teacher only sees their own groups, a parent only their
 * own children) in the service layer, and Postgres RLS keeps every query inside the caller's centre.
 */
import { DomainError } from './errors';

export const ROLES = ['director', 'admin', 'teacher', 'student', 'parent'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard.read',
  'centre.manage',
  'courses.manage',
  'groups.read',
  'groups.manage',
  'students.read',
  'students.manage',
  'leads.manage',
  'attendance.mark',
  'billing.read',
  'payments.record',
  'billing.remind',
  'payroll.read',
  'payroll.own',
  'salary.manage',
  'homework.manage',
  'homework.submit',
  'tests.manage',
  'tests.take',
  'certificates.issue',
  'certificates.read',
  'self.read',
  'pay.online',
  'audit.read',
  'outbox.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF: Permission[] = [
  'dashboard.read', 'courses.manage', 'groups.read', 'groups.manage', 'students.read', 'students.manage', 'leads.manage',
  'attendance.mark', 'billing.read', 'payments.record', 'billing.remind', 'homework.manage', 'tests.manage',
  'certificates.issue', 'certificates.read', 'outbox.read',
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  director: new Set<Permission>([...STAFF, 'centre.manage', 'payroll.read', 'salary.manage', 'audit.read']),
  admin: new Set<Permission>(STAFF),
  teacher: new Set<Permission>(['groups.read', 'students.read', 'attendance.mark', 'homework.manage', 'tests.manage', 'payroll.own', 'certificates.read', 'outbox.read']),
  student: new Set<Permission>(['self.read', 'homework.submit', 'tests.take', 'pay.online', 'certificates.read', 'outbox.read']),
  parent: new Set<Permission>(['self.read', 'pay.online', 'certificates.read', 'outbox.read']),
};

export const can = (role: Role, p: Permission): boolean => MATRIX[role]?.has(p) ?? false;

export function requirePermission(role: Role | null | undefined, p: Permission): void {
  if (!role) throw new DomainError('UNAUTHENTICATED');
  if (!can(role, p)) throw new DomainError('FORBIDDEN', `Role ${role} lacks ${p}`, { permission: p });
}

export const isStaff = (r: Role): boolean => r === 'director' || r === 'admin' || r === 'teacher';
export const isManager = (r: Role): boolean => r === 'director' || r === 'admin';
