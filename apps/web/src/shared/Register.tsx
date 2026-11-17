/** The attendance register for one lesson — used on the web panel and inside the teacher's Mini App. */
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AttendanceStatus, Role } from '@ustoz/core';
import { useAction, useData } from '../api/context';
import { useT } from '../i18n';
import { Icon } from '../ui/icons';
import { Avatar, ErrorBox, Loading, useErrorToast, useToast } from '../ui/kit';

const STATES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

export function Register({ as, groupId, date, compact, onSaved }: { as: Role; groupId: string; date: string; compact?: boolean; onSaved?(): void }) {
  const { t } = useT();
  const sheet = useData(as, 'attendance.sheet', { groupId, date });
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.filter((s) => s.status).map((s) => [s.studentId, s.status!])));
  }, [sheet.data]);
  if (sheet.error) return <ErrorBox error={sheet.error} />;
  if (!sheet.data) return <Loading rows={6} />;
  const students = sheet.data.students;
  const done = students.filter((s) => marks[s.studentId]).length;
  const changed = students.some((s) => marks[s.studentId] && marks[s.studentId] !== s.status);
  const save = async () => {
    try {
      const r = await run(as, 'attendance.mark', { groupId, date, marks: students.filter((s) => marks[s.studentId]).map((s) => ({ studentId: s.studentId, status: marks[s.studentId]! })) });
      toast(t('a.saved', { n: r.saved, m: r.notified }));
      onSaved?.();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className={`register${compact ? ' compact' : ''}`}>
      <div className="spread register-head">
        <span className="muted">{t('a.marked', { a: done, b: students.length })}</span>
        <button className="btn btn-sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, marks[s.studentId] ?? 'present'])))}><Icon name="check" size={15} />{t('a.allPresent')}</button>
      </div>
      <div className="register-list">
        {students.map((s, i) => {
          const cur = marks[s.studentId];
          return (
            <motion.div key={s.studentId} className={`register-row${cur ? ` is-${cur}` : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} data-testid="register-row">
              <Avatar name={s.fullName} size={compact ? 30 : 34} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 600 }}>{s.fullName}</div>
                {s.streak >= 2 && <div className="text-bad" style={{ fontSize: 11 }}>{t('a.streak', { n: s.streak })}</div>}
              </div>
              <div className="mark-group" role="radiogroup" aria-label={s.fullName}>
                {STATES.map((st) => (
                  <button key={st} type="button" role="radio" aria-checked={cur === st} aria-label={t(`a.${st}`)} title={t(`a.${st}`)} className={`mark mark-${st}${cur === st ? ' on' : ''}`}
                    onClick={() => setMarks((m) => ({ ...m, [s.studentId]: st }))}>
                    {cur === st && <motion.span layoutId={`mk-${s.studentId}`} className="mark-pill" transition={{ type: 'spring', stiffness: 600, damping: 35 }} />}
                    <span>{t(`a.${st}`).slice(0, compact ? 1 : 3)}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
      <button className="btn btn-accent btn-lg btn-block register-save" disabled={busy || !changed} onClick={save} data-testid="save-register">{t('a.saveMarks')}</button>
    </div>
  );
}
