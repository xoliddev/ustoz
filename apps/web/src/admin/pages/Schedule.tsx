/** Weekly timetable (lanes for parallel lessons), branch filter, group details and the new-group form. */
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { addDays, fmtTime, type IsoDate } from '@ustoz/core';
import { useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Drawer, ErrorBox, Loading, Seg } from '../../ui/kit';
import { GroupDetails, GroupForm } from './GroupForm';

const START = 8 * 60;
const END = 21 * 60;
const PX = 0.9; // px per minute

type Lesson = { date: string; groupId: string; name: string; courseName: string; color: string; teacherName: string | null; roomName: string | null; startMin: number; endMin: number; students: number; branchName: string };

/** Assigns side-by-side lanes to overlapping lessons of one day. */
function lanes(list: Lesson[]): Array<Lesson & { lane: number; lanes: number }> {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: Array<Lesson & { lane: number; lanes: number }> = [];
  let cluster: Array<Lesson & { lane: number; lanes: number }> = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
  };
  for (const l of sorted) {
    if (l.startMin >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.endMin > l.startMin).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...l, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, l.endMin);
  }
  if (cluster.length) flush();
  return out;
}

export default function Schedule() {
  const { t, day, wd } = useT();
  const { role } = useRole();
  const [weekOf, setWeekOf] = useState<IsoDate | undefined>(undefined);
  const [branch, setBranch] = useState<string>('all');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const st = useData(role, 'org.structure', {});
  const week = useData(role, 'schedule.week', { ...(weekOf ? { weekOf } : {}), ...(branch !== 'all' ? { branchId: branch } : {}) });
  const days = useMemo(() => (week.data ? Array.from({ length: 7 }, (_, i) => addDays(week.data!.from, i)) : []), [week.data]);
  if (week.error) return <ErrorBox error={week.error} retry={week.reload} />;
  const manager = role === 'director' || role === 'admin';
  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('s.title')}</h1>
          {week.data && <p className="muted">{day(week.data.from)} — {day(week.data.to)} · {week.data.lessons.length} {t('c.lessons')}</p>}
        </div>
        <div className="row-wrap">
          {st.data && st.data.branches.length > 1 && (
            <Seg value={branch} onChange={setBranch} label={t('c.branch')} options={[{ v: 'all', label: t('c.all') }, ...st.data.branches.map((b) => ({ v: b.id, label: b.name }))]} />
          )}
          <div className="row">
            <button className="btn icon-btn" aria-label={t('s.prevWeek')} onClick={() => week.data && setWeekOf(addDays(week.data.from, -7))}><Icon name="back" /></button>
            <button className="btn" onClick={() => setWeekOf(undefined)}>{t('c.today')}</button>
            <button className="btn icon-btn" aria-label={t('s.nextWeek')} onClick={() => week.data && setWeekOf(addDays(week.data.from, 7))}><Icon name="next" /></button>
          </div>
          {manager && <button className="btn btn-accent" onClick={() => setCreating(true)}><Icon name="plus" />{t('s.newGroup')}</button>}
        </div>
      </div>
      {!week.data ? (
        <Loading rows={8} />
      ) : (
        <div className="card tt-wrap">
          <div className="tt" style={{ ['--h' as string]: `${(END - START) * PX}px` }}>
            <div className="tt-hours">
              <div className="tt-dayhead" />
              <div className="tt-col-body">{hours.map((h) => <span key={h} style={{ top: (h - START) * PX }}>{fmtTime(h)}</span>)}</div>
            </div>
            {days.map((d) => {
              const list = lanes(week.data!.lessons.filter((x) => x.date === d) as Lesson[]);
              const isToday = d === week.data!.today;
              return (
                <div key={d} className={`tt-day${isToday ? ' today' : ''}`}>
                  <div className="tt-dayhead"><b>{wd(d)}</b><span>{day(d)}</span></div>
                  <div className="tt-col-body">
                    {hours.map((h) => <i key={h} className="tt-line" style={{ top: (h - START) * PX }} />)}
                    {list.map((l, i) => (
                      <motion.button key={`${l.groupId}-${d}`} className="tt-lesson" onClick={() => setOpenGroup(l.groupId)}
                        style={{ top: (Math.max(l.startMin, START) - START) * PX, height: Math.max(26, (l.endMin - l.startMin) * PX - 3), left: `calc(${(100 * l.lane) / l.lanes}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)`, ['--c' as string]: l.color }}
                        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }} data-testid="tt-lesson">
                        <b className="ellipsis">{l.name}</b>
                        <span className="ellipsis">{fmtTime(l.startMin)}–{fmtTime(l.endMin)} · {l.roomName}</span>
                        <span className="ellipsis">{l.teacherName}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Drawer open={!!openGroup} title={t('c.group')} onClose={() => setOpenGroup(null)}>
        {openGroup && <GroupDetails groupId={openGroup} />}
      </Drawer>
      <Drawer open={creating} title={t('s.newGroup')} onClose={() => setCreating(false)}>
        {creating && <GroupForm onDone={() => setCreating(false)} />}
      </Drawer>
    </div>
  );
}
