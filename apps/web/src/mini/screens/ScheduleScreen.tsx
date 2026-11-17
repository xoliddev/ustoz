/** Mini App: the child's lessons this week and next. */
import { addDays, fmtTime } from '@ustoz/core';
import { useData } from '../../api/context';
import { useT } from '../../i18n';
import { Empty, Loading } from '../../ui/kit';

export function ScheduleScreen({ as, groups }: { as: 'student' | 'parent'; studentId: string; groups: string[] }) {
  const { t, day, wd } = useT();
  const w1 = useData(as, 'schedule.week', {});
  const w2 = useData(as, 'schedule.week', w1.data ? { weekOf: addDays(w1.data.from, 7) } : null);
  if (!w1.data) return <div className="mini-pad"><Loading /></div>;
  const lessons = [...w1.data.lessons, ...(w2.data?.lessons ?? [])].filter((l) => groups.includes(l.name) && l.date >= w1.data!.today);
  const byDay = new Map<string, typeof lessons>();
  for (const l of lessons) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  return (
    <div className="mini-pad stack">
      <h2>{t('mini.schedule')}</h2>
      {!lessons.length && <Empty text={t('mini.noNext')} />}
      {[...byDay].map(([d, ls]) => (
        <div key={d} className="mini-day">
          <div className={`mini-day-head${d === w1.data!.today ? ' today' : ''}`}><b>{d === w1.data!.today ? t('c.today') : wd(d)}</b><span>{day(d)}</span></div>
          {ls.map((l) => (
            <div key={l.groupId + d} className="mini-lesson" style={{ ['--c' as string]: l.color }}>
              <span className="num mini-lesson-time">{fmtTime(l.startMin)}<small>{fmtTime(l.endMin)}</small></span>
              <span className="grow"><b>{l.name}</b><span className="muted" style={{ display: 'block', fontSize: 12 }}>{l.roomName} · {l.teacherName}</span></span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
