/** Attendance: the day's lessons on the left, the register on the right. Absences ping parents instantly. */
import { useState } from 'react';
import { addDays, fmtTime } from '@ustoz/core';
import { useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Empty, ErrorBox, Loading } from '../../ui/kit';
import { Register } from '../../shared/Register';

export default function Attendance() {
  const { t, day, wd } = useT();
  const { role } = useRole();
  const me = useData(role, 'me', {});
  const [date, setDate] = useState<string | null>(null);
  const today = me.data?.today ?? null;
  const d = date ?? today;
  const lessons = useData(role, 'attendance.today', d ? { date: d } : null);
  const [picked, setPicked] = useState<string | null>(null);
  if (lessons.error) return <ErrorBox error={lessons.error} retry={lessons.reload} />;
  const list = lessons.data?.lessons ?? [];
  const groupId = picked && list.some((l) => l.id === picked) ? picked : list[0]?.id ?? null;
  const days = today ? Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)) : [];
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('a.title')}</h1>
          <p className="muted">{t('demo.phoneHint')}</p>
        </div>
        <div className="row-wrap" role="tablist" aria-label={t('c.date')}>
          {days.map((x) => (
            <button key={x} role="tab" aria-selected={x === d} className={`btn btn-sm ${x === d ? 'btn-primary' : ''}`} onClick={() => { setDate(x); setPicked(null); }}>
              {x === today ? t('c.today') : `${wd(x)} ${day(x)}`}
            </button>
          ))}
        </div>
      </div>
      {!lessons.data ? (
        <Loading rows={6} />
      ) : !list.length ? (
        <div className="card"><Empty text={t('a.noLessons')} icon="schedule" /></div>
      ) : (
        <div className="att-layout">
          <div className="stack-sm">
            {list.map((l) => (
              <button key={l.id} className={`lesson-pick${l.id === groupId ? ' on' : ''}`} onClick={() => setPicked(l.id)} style={{ ['--c' as string]: l.color }} data-testid="lesson-pick">
                <span className="lesson-time num">{fmtTime(l.startMin)}<small>{fmtTime(l.endMin)}</small></span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b className="ellipsis" style={{ display: 'block' }}>{l.name}</b>
                  <span className="muted ellipsis" style={{ display: 'block', fontSize: 12 }}>{l.roomName} · {l.teacherName}</span>
                </span>
                {l.marked > 0 ? <span className="badge badge-ok"><Icon name="check" size={13} />{l.marked}</span> : <span className="badge">{l.students}</span>}
              </button>
            ))}
          </div>
          <div className="card">{groupId && d && <Register key={`${groupId}-${d}`} as={role} groupId={groupId} date={d} />}</div>
        </div>
      )}
    </div>
  );
}
