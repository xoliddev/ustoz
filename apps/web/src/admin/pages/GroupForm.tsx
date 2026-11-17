/** New-group form with live schedule-conflict detection, and the group details drawer. */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { fmtTime, parseTime, WEEKDAYS } from '@ustoz/core';
import type { Conflict } from '@ustoz/core';
import { useAction, useApi, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Avatar, Loading, Money, useErrorToast, useToast } from '../../ui/kit';

export function GroupForm({ onDone }: { onDone(): void }) {
  const { t, l } = useT();
  const { role } = useRole();
  const api = useApi();
  const st = useData(role, 'org.structure', {});
  const me = useData(role, 'me', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [f, setF] = useState({ name: '', courseId: '', teacherId: '', roomId: '', days: [1, 3, 5] as number[], start: '10:00', end: '11:30', startsOn: '', capacity: 12 });
  const [conflicts, setConflicts] = useState<Array<Conflict & { otherName: string }> | null>(null);
  const s = st.data;
  const room = s?.rooms.find((r) => r.id === (f.roomId || s.rooms[0]?.id));
  const input = s && room ? {
    name: f.name || 'New', courseId: f.courseId || s.courses[0]!.id, teacherId: f.teacherId || s.teachers[0]!.id, roomId: room.id, branchId: room.branchId,
    days: f.days.length ? f.days : [1], startMin: parseTime(f.start), endMin: parseTime(f.end), startsOn: f.startsOn || me.data?.today || '2026-01-01', endsOn: null, capacity: f.capacity,
  } : null;
  const key = JSON.stringify(input);

  useEffect(() => {
    if (!input || input.endMin <= input.startMin) return;
    const id = setTimeout(() => {
      api.call(role, 'groups.checkConflicts', input).then((r) => setConflicts(r.conflicts), () => setConflicts(null));
    }, 180);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, api, role]);

  if (!s) return <Loading />;
  const wd = WEEKDAYS[l] ?? WEEKDAYS.uz!;
  const save = async () => {
    try {
      await run(role, 'groups.save', { ...input!, name: f.name });
      toast(t('s.created'));
      onDone();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="field"><span>{t('c.group')}</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="IELTS 7.0 · Weekend" /></label>
      <label className="field"><span>{t('c.course')}</span>
        <select className="select" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{s.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <div className="grid-2">
        <label className="field"><span>{t('c.teacher')}</span>
          <select className="select" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>{s.teachers.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}</select>
        </label>
        <label className="field"><span>{t('c.room')}</span>
          <select className="select" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            {s.branches.map((b) => <optgroup key={b.id} label={b.name}>{s.rooms.filter((r) => r.branchId === b.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
      <div className="field"><span>{t('c.days')}</span>
        <div className="row-wrap">
          {wd.map((name, i) => {
            const d = i + 1;
            const on = f.days.includes(d);
            return <button key={d} type="button" className={`btn btn-sm ${on ? 'btn-primary' : ''}`} aria-pressed={on} onClick={() => setF({ ...f, days: on ? f.days.filter((x) => x !== d) : [...f.days, d].sort() })}>{name}</button>;
          })}
        </div>
      </div>
      <div className="grid-3">
        <label className="field"><span>{t('c.start')}</span><input className="input" type="time" step={900} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label className="field"><span>{t('c.end')}</span><input className="input" type="time" step={900} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label className="field"><span>{t('c.capacity')}</span><input className="input" type="number" min={1} max={200} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></label>
      </div>
      <label className="field"><span>{t('c.date')}</span><input className="input" type="date" value={f.startsOn || me.data?.today || ''} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></label>
      <div aria-live="polite" data-testid="conflicts">
        <AnimatePresence mode="wait">
          {conflicts && conflicts.length === 0 && (
            <motion.div key="ok" className="notice notice-ok" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon name="check" />{t('s.conflictFree')}</motion.div>
          )}
          {conflicts && conflicts.length > 0 && (
            <motion.div key="bad" className="notice notice-bad" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, x: [0, -4, 4, -2, 0] }} exit={{ opacity: 0 }}>
              <Icon name="alert" />
              <div className="stack-sm">
                {conflicts.map((c, i) => <span key={i}>{t(`s.conflict.${c.kind}`, { other: c.otherName, days: c.days.map((d) => wd[d - 1]).join(', '), time: `${fmtTime(c.start)}–${fmtTime(c.end)}` })}</span>)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <button className="btn btn-accent btn-lg" disabled={busy || !f.name || (conflicts?.length ?? 0) > 0 || !f.days.length}>{t('c.save')}</button>
    </form>
  );
}

export function GroupDetails({ groupId }: { groupId: string }) {
  const { t, day, l } = useT();
  const { role } = useRole();
  const g = useData(role, 'groups.get', { groupId });
  const students = useData(role === 'teacher' ? role : role, 'students.list', role === 'teacher' ? null : {});
  const me = useData(role, 'me', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [pick, setPick] = useState('');
  if (!g.data) return <Loading />;
  const { group, students: list } = g.data;
  const wd = WEEKDAYS[l] ?? WEEKDAYS.uz!;
  const inGroup = new Set(list.filter((s) => !s.leftOn).map((s) => s.studentId));
  const enroll = async () => {
    try {
      const r = await run(role, 'groups.enroll', { groupId, studentId: pick, joinedOn: me.data!.today });
      toast(`${t('c.saved')} · ${t('st.lessonsBilled', { a: r.invoice?.lessonsBilled ?? 0, b: r.invoice?.lessonsInMonth ?? 0 })}`);
      setPick('');
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="stack">
      <div className="card" style={{ borderTop: `4px solid ${group.color}` }}>
        <h2>{group.name}</h2>
        <p className="muted">{group.courseName} · {group.teacherName} · {group.roomName} ({group.branchName})</p>
        <div className="row-wrap" style={{ marginTop: 8 }}>
          <span className="badge">{group.days.map((d) => wd[d - 1]).join(' · ')}</span>
          <span className="badge">{fmtTime(group.startMin)}–{fmtTime(group.endMin)}</span>
          <span className="badge badge-data">{group.students}/{group.capacity}</span>
          <span className="badge badge-accent"><Money v={group.monthlyFee} /></span>
          <span className="badge">{t('c.start')}: {day(group.startsOn)}</span>
        </div>
      </div>
      {role !== 'teacher' && students.data && (
        <div className="row">
          <select className="select grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('st.enroll')}>
            <option value="">{t('st.enroll')}…</option>
            {students.data.filter((s) => !inGroup.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!pick || busy} onClick={enroll}><Icon name="plus" />{t('c.add')}</button>
        </div>
      )}
      <div className="card-flat">
        {list.map((s) => (
          <div key={s.enrollmentId} className="list-row" style={{ opacity: s.leftOn ? 0.5 : 1 }}>
            <Avatar name={s.fullName} size={28} />
            <span className="grow ellipsis">{s.fullName}</span>
            <span className="muted" style={{ fontSize: 12 }}>{day(s.joinedOn)}{s.leftOn ? ` → ${day(s.leftOn)}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
