/** Mini App home: next lesson, balance with online payment, latest grades. */
import { motion } from 'motion/react';
import { useState } from 'react';
import { fmtTime } from '@ustoz/core';
import { useData } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Loading, Money } from '../../ui/kit';
import { PaySheet } from './Pay';

export function Home({ as, studentId, go }: { as: 'student' | 'parent'; studentId: string; go(tab: 'homework' | 'progress' | 'tests'): void }) {
  const { t, day, wd } = useT();
  const me = useData(as, 'me', {});
  const kids = useData(as, 'family.children', {});
  const week = useData(as, 'schedule.week', {});
  const st = useData(as, 'billing.statement', { studentId });
  const prog = useData(as, 'progress.student', { studentId });
  const hw = useData(as, 'homework.mine', { studentId });
  const [paying, setPaying] = useState(false);
  if (!me.data || !week.data || !st.data) return <div className="mini-pad"><Loading rows={4} /></div>;
  const kid = kids.data?.find((k) => k.id === studentId);
  const now = new Date();
  const nowMin = ((now.getUTCHours() + 5) % 24) * 60 + now.getUTCMinutes();
  const next = week.data.lessons.find((l) => (kid?.groups ?? []).includes(l.name) && (l.date > week.data!.today || (l.date === week.data!.today && l.endMin > nowMin)));
  const open = hw.data?.filter((h) => !h.submissionId && h.dueOn >= week.data!.today).length ?? 0;
  const recent = [...(prog.data?.homework.map((h) => ({ d: h.date, title: h.title, v: h.grade })) ?? []), ...(prog.data?.tests.map((x) => ({ d: x.date, title: x.title, v: x.score })) ?? [])].sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 3);
  return (
    <div className="mini-pad stack">
      <div>
        <h2 className="mini-hello">{t('mini.hello', { name: (me.data.personName ?? '').split(' ')[0] ?? '' })}</h2>
        {as === 'parent' && kid && <p className="muted">{kid.fullName} · {kid.groups.join(', ')}</p>}
      </div>
      <motion.div className="mini-card mini-next" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <span className="mini-label">{t('mini.next')}</span>
        {next ? (
          <>
            <b className="mini-big">{next.date === week.data.today ? t('c.today') : `${wd(next.date)}, ${day(next.date)}`} · {fmtTime(next.startMin)}</b>
            <span>{next.name} · {next.roomName}</span>
            <span className="muted">{next.teacherName}</span>
          </>
        ) : <span className="muted">{t('mini.noNext')}</span>}
      </motion.div>
      <div className={`mini-card mini-balance${st.data.debt > 0 ? ' due' : ''}`} data-testid="mini-balance">
        <div className="spread">
          <span className="mini-label">{t('mini.balance')}</span>
          {st.data.overdue > 0 && <span className="badge badge-bad">{t('c.overdue')}</span>}
        </div>
        {st.data.debt > 0 ? (
          <>
            <b className="mini-big"><Money v={st.data.debt} /></b>
            <button className="btn btn-accent btn-lg btn-block" onClick={() => setPaying(true)} data-testid="mini-pay"><Icon name="wallet" />{t('mini.pay')}</button>
          </>
        ) : (
          <b className="mini-big ok"><Icon name="check" />{t('mini.noDebt')}</b>
        )}
      </div>
      <div className="mini-row2">
        <button className="mini-card mini-stat" onClick={() => go('homework')}><span className="mini-label">{t('mini.homework')}</span><b className="mini-big">{open}</b></button>
        <button className="mini-card mini-stat" onClick={() => go('progress')}><span className="mini-label">{t('mini.avgHw')}</span><b className="mini-big">{prog.data?.averages.homework ?? '—'}</b></button>
      </div>
      {recent.length > 0 && (
        <div className="mini-card">
          <span className="mini-label">{t('nav.tests')} · {t('mini.homework')}</span>
          {recent.map((r, i) => <div key={i} className="spread mini-line"><span className="ellipsis">{r.title}</span><b className={r.v >= 85 ? 'text-ok' : r.v < 60 ? 'text-bad' : ''}>{r.v}</b></div>)}
        </div>
      )}
      <PaySheet open={paying} as={as} studentId={studentId} debt={st.data.debt} onClose={() => setPaying(false)} />
    </div>
  );
}
