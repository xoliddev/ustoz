/** The Telegram Mini App: student, parent and teacher views (Back on every inner screen, a bottom tab bar). */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { Role } from '@ustoz/core';
import { useData } from '../api/context';
import { useT } from '../i18n';
import { Icon, type IconName } from '../ui/icons';
import { Loading } from '../ui/kit';
import { Home } from './screens/Home';
import { HomeworkList } from './screens/HomeworkList';
import { Progress } from './screens/Progress';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { TeacherToday } from './screens/Teacher';
import { TestsScreen } from './screens/TestsScreen';

type Tab = 'home' | 'schedule' | 'homework' | 'tests' | 'progress';
const TABS: Record<'student' | 'parent', Array<{ k: Tab; icon: IconName; label: string }>> = {
  student: [
    { k: 'home', icon: 'home', label: 'mini.home' },
    { k: 'schedule', icon: 'schedule', label: 'mini.schedule' },
    { k: 'homework', icon: 'homework', label: 'mini.homework' },
    { k: 'tests', icon: 'tests', label: 'mini.tests' },
    { k: 'progress', icon: 'chart', label: 'mini.progress' },
  ],
  parent: [
    { k: 'home', icon: 'home', label: 'mini.home' },
    { k: 'schedule', icon: 'schedule', label: 'mini.schedule' },
    { k: 'homework', icon: 'homework', label: 'mini.homework' },
    { k: 'progress', icon: 'chart', label: 'mini.progress' },
  ],
};

export function MiniApp({ persona }: { persona: Role }) {
  if (persona === 'teacher') return <div className="mini"><TeacherToday /></div>;
  if (persona !== 'student' && persona !== 'parent') return null;
  return <FamilyApp persona={persona} />;
}

function FamilyApp({ persona }: { persona: 'student' | 'parent' }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('home');
  const kids = useData(persona, 'family.children', {});
  const [child, setChild] = useState<string | null>(null);
  if (!kids.data) return <div className="mini"><div className="mini-pad"><Loading /></div></div>;
  const studentId = child && kids.data.some((k) => k.id === child) ? child : kids.data[0]?.id ?? null;
  const tabs = TABS[persona];
  return (
    <div className="mini" data-testid={`mini-${persona}`}>
      {persona === 'parent' && kids.data.length > 1 && (
        <div className="mini-kids" role="tablist" aria-label={t('mini.child')}>
          {kids.data.map((k) => (
            <button key={k.id} role="tab" aria-selected={k.id === studentId} className={k.id === studentId ? 'on' : ''} onClick={() => setChild(k.id)}>
              {k.id === studentId && <motion.span layoutId="kid-pill" className="kid-pill" />}
              <span>{k.fullName.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mini-scroll">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${tab}-${studentId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            {studentId && tab === 'home' && <Home as={persona} studentId={studentId} go={setTab} />}
            {studentId && tab === 'schedule' && <ScheduleScreen as={persona} studentId={studentId} groups={kids.data.find((k) => k.id === studentId)?.groups ?? []} />}
            {studentId && tab === 'homework' && <HomeworkList as={persona} studentId={studentId} />}
            {tab === 'tests' && <TestsScreen />}
            {studentId && tab === 'progress' && <Progress as={persona} studentId={studentId} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <nav className="mini-tabs" aria-label="Mini App">
        {tabs.map((x) => (
          <button key={x.k} className={tab === x.k ? 'on' : ''} aria-current={tab === x.k ? 'page' : undefined} onClick={() => setTab(x.k)}>
            <Icon name={x.icon} size={20} />
            <span>{t(x.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
