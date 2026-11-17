/** Renders one admin section with a short enter animation. */
import { motion } from 'motion/react';
import { lazy, Suspense } from 'react';
import { Loading } from '../ui/kit';
import type { PageKey } from './pages';

const PAGES: Record<PageKey, React.LazyExoticComponent<() => React.JSX.Element>> = {
  dashboard: lazy(() => import('./pages/Dashboard')),
  leads: lazy(() => import('./pages/Leads')),
  schedule: lazy(() => import('./pages/Schedule')),
  students: lazy(() => import('./pages/Students')),
  attendance: lazy(() => import('./pages/Attendance')),
  billing: lazy(() => import('./pages/Billing')),
  payroll: lazy(() => import('./pages/Payroll')),
  homework: lazy(() => import('./pages/Homework')),
  tests: lazy(() => import('./pages/Tests')),
  certificates: lazy(() => import('./pages/Certificates')),
};

export function AdminPage({ page }: { page: PageKey }) {
  const P = PAGES[page];
  return (
    <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} data-testid={`page-${page}`}>
      <Suspense fallback={<Loading rows={6} />}>
        <P />
      </Suspense>
    </motion.div>
  );
}
