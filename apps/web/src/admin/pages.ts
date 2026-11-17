/** Admin sections and which roles see them (the backend enforces the same rules). */
import type { Role } from '@ustoz/core';
import type { IconName } from '../ui/icons';

export const PAGES = {
  dashboard: { label: 'nav.dashboard', icon: 'dashboard' },
  leads: { label: 'nav.leads', icon: 'leads' },
  schedule: { label: 'nav.schedule', icon: 'schedule' },
  students: { label: 'nav.students', icon: 'students' },
  attendance: { label: 'nav.attendance', icon: 'attendance' },
  billing: { label: 'nav.billing', icon: 'billing' },
  payroll: { label: 'nav.payroll', icon: 'payroll' },
  homework: { label: 'nav.homework', icon: 'homework' },
  tests: { label: 'nav.tests', icon: 'tests' },
  certificates: { label: 'nav.certificates', icon: 'certificates' },
} satisfies Record<string, { label: string; icon: IconName }>;

export type PageKey = keyof typeof PAGES;

const BY_ROLE: Record<Role, PageKey[]> = {
  director: ['dashboard', 'leads', 'schedule', 'students', 'attendance', 'billing', 'payroll', 'homework', 'tests', 'certificates'],
  admin: ['dashboard', 'leads', 'schedule', 'students', 'attendance', 'billing', 'homework', 'tests', 'certificates'],
  teacher: ['attendance', 'schedule', 'students', 'homework', 'tests', 'payroll'],
  student: [],
  parent: [],
};

export const pagesFor = (r: Role): PageKey[] => BY_ROLE[r];
