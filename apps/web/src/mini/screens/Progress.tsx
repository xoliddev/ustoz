/** Mini App progress: grade line, averages and monthly attendance bars. */
import { useData } from '../../api/context';
import { useT } from '../../i18n';
import { Ring, ScoreLine, StackBars } from '../../ui/charts';
import { Loading } from '../../ui/kit';

export function Progress({ as, studentId }: { as: 'student' | 'parent'; studentId: string }) {
  const { t, monthShort } = useT();
  const p = useData(as, 'progress.student', { studentId });
  if (!p.data) return <div className="mini-pad"><Loading /></div>;
  const points = [...p.data.homework.map((h) => ({ label: h.date, v: h.grade })), ...p.data.tests.map((x) => ({ label: x.date, v: x.score }))].sort((a, b) => (a.label < b.label ? -1 : 1));
  const att = p.data.attendance.reduce((s, x) => ({ ok: s.ok + x.present + x.late, all: s.all + x.present + x.late + x.absent }), { ok: 0, all: 0 });
  return (
    <div className="mini-pad stack" data-testid="mini-progress">
      <h2>{p.data.fullName}</h2>
      <div className="mini-row3">
        <div className="mini-card mini-stat"><span className="mini-label">{t('mini.avgHw')}</span><b className="mini-big">{p.data.averages.homework ?? '—'}</b></div>
        <div className="mini-card mini-stat"><span className="mini-label">{t('mini.avgTests')}</span><b className="mini-big">{p.data.averages.tests ?? '—'}</b></div>
        <div className="mini-card mini-stat" style={{ justifyItems: 'center' }}><Ring value={att.all ? att.ok / att.all : null} size={54} label={t('st.attRate')} /></div>
      </div>
      <div className="mini-card">
        <span className="mini-label">{t('mini.grades')}</span>
        <ScoreLine points={points} height={130} />
      </div>
      <div className="mini-card">
        <span className="mini-label">{t('mini.attendance')}</span>
        <StackBars rows={p.data.attendance.map((m) => ({ label: monthShort(m.month), parts: [{ v: m.present, color: 'var(--ok)' }, { v: m.late, color: 'var(--warn)' }, { v: m.absent, color: 'var(--bad)' }, { v: m.excused, color: 'var(--line-2)' }] }))} />
        <div className="row-wrap legend" style={{ fontSize: 11 }}>
          {(['present', 'late', 'absent', 'excused'] as const).map((s) => <span key={s} className="row"><i className={`att-dot ${s}`} />{t(`a.${s}`)}</span>)}
        </div>
      </div>
    </div>
  );
}
