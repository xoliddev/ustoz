/** Mini App homework: status and grades; students can hand in a text answer here too (or via the bot). */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useAction, useData } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Empty, Loading, useErrorToast, useToast } from '../../ui/kit';

export function HomeworkList({ as, studentId }: { as: 'student' | 'parent'; studentId: string }) {
  const { t, day } = useT();
  const list = useData(as, 'homework.mine', { studentId });
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  if (!list.data) return <div className="mini-pad"><Loading /></div>;
  return (
    <div className="mini-pad stack">
      <h2>{t('h.title')}</h2>
      {!list.data.length && <Empty />}
      {list.data.map((h) => {
        const state = h.grade !== null ? 'graded' : h.submissionId ? 'sent' : 'open';
        return (
          <div key={h.id} className={`mini-card mini-hw ${state}`} data-testid="mini-hw">
            <div className="spread">
              <span className="muted" style={{ fontSize: 12 }}>{h.groupName} · {t('h.due')} {day(h.dueOn)}</span>
              {state === 'graded' ? <span className="badge badge-ok">{h.grade}/100</span> : state === 'sent' ? <span className="badge badge-data">{t('mini.done')}</span> : <span className="badge badge-accent">{t('h.notSubmitted')}</span>}
            </div>
            <b>{h.title}</b>
            {h.feedback && <p className="muted" style={{ fontSize: 13 }}>“{h.feedback}”</p>}
            {as === 'student' && state !== 'graded' && (
              open === h.id ? (
                <AnimatePresence>
                  <motion.div className="stack-sm" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
                    <textarea className="textarea" rows={3} placeholder={t('mini.submitText')} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                    <button className="btn btn-primary btn-block" disabled={busy || !answer.trim()} onClick={async () => {
                      try {
                        await run(as, 'homework.submit', { homeworkId: h.id, kind: 'text', body: answer.trim() });
                        toast(t('mini.done'));
                        setOpen(null);
                        setAnswer('');
                      } catch (e) {
                        fail(e);
                      }
                    }}><Icon name="send" size={15} />{t('mini.send')}</button>
                  </motion.div>
                </AnimatePresence>
              ) : (
                <button className="btn btn-sm" onClick={() => { setOpen(h.id); setAnswer(''); }}>{t('mini.send')}</button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
