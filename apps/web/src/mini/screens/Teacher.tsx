/** Teacher Mini App: today's lessons → tap one → mark the register (parents are notified instantly). */
import { useState } from 'react';
import { fmtTime } from '@ustoz/core';
import { useData } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Empty, Loading } from '../../ui/kit';
import { Register } from '../../shared/Register';

export function TeacherToday() {
  const { t, day } = useT();
  const today = useData('teacher', 'attendance.today', {});
  const [open, setOpen] = useState<string | null>(null);
  if (!today.data) return <div className="mini-pad"><Loading /></div>;
  const lesson = today.data.lessons.find((l) => l.id === open);
  if (lesson)
    return (
      <div className="mini-scroll">
        <div className="mini-pad stack">
          <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setOpen(null)}><Icon name="back" size={15} />{t('c.back')}</button>
          <div><h2>{lesson.name}</h2><p className="muted">{fmtTime(lesson.startMin)}–{fmtTime(lesson.endMin)} · {lesson.roomName}</p></div>
          <Register as="teacher" groupId={lesson.id} date={today.data.date} compact onSaved={() => setOpen(null)} />
        </div>
      </div>
    );
  return (
    <div className="mini-scroll">
      <div className="mini-pad stack" data-testid="mini-teacher">
        <div><h2>{t('mini.todayLessons')}</h2><p className="muted">{day(today.data.date)}</p></div>
        {!today.data.lessons.length && <Empty text={t('a.noLessons')} icon="schedule" />}
        {today.data.lessons.map((l) => (
          <button key={l.id} className="mini-card mini-lesson-btn" style={{ ['--c' as string]: l.color }} onClick={() => setOpen(l.id)} data-testid="teacher-lesson">
            <span className="num mini-lesson-time">{fmtTime(l.startMin)}<small>{fmtTime(l.endMin)}</small></span>
            <span className="grow" style={{ textAlign: 'left' }}><b>{l.name}</b><span className="muted" style={{ display: 'block', fontSize: 12 }}>{l.roomName} · {l.students} {t('c.students')}</span></span>
            {l.marked > 0 ? <span className="badge badge-ok"><Icon name="check" size={13} />{l.marked}</span> : <span className="btn btn-sm btn-accent">{t('mini.mark')}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
