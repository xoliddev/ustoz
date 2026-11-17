/** Test generator: topic or pasted text → multiple-choice preview → publish to a group → leaderboard. */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { GeneratedTest } from '@ustoz/core';
import { ClientError } from '../../api/types';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Avatar, Drawer, ErrorBox, Loading, useErrorToast, useToast } from '../../ui/kit';

const SUGGEST = ['Present Simple (English grammar)', 'IELTS vocabulary', 'Python asoslari', 'Matematika: foizlar va tenglamalar'];

export default function Tests() {
  const { t, day } = useT();
  const { role } = useRole();
  const list = useData(role, 'tests.list', {});
  const groups = useData(role, 'groups.list', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [count, setCount] = useState(8);
  const [preview, setPreview] = useState<GeneratedTest | null>(null);
  const [groupId, setGroupId] = useState('');
  const [board, setBoard] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const gid = groupId || groups.data?.find((g) => g.status === 'active')?.id || '';

  const generate = async (tp = topic) => {
    setHint(null);
    try {
      setPreview(await run(role, 'tests.generate', { topic: tp || undefined, text: text || undefined, count }));
    } catch (e) {
      if (e instanceof ClientError && e.details.reason === 'UNKNOWN_TOPIC') setHint(t('t.unknownTopic'));
      else if (e instanceof ClientError && e.details.reason === 'TEXT_TOO_SHORT') setHint(t('t.tooShort'));
      else fail(e);
    }
  };
  const publish = async () => {
    try {
      const r = await run(role, 'tests.publish', { groupId: gid, title: preview!.title, topic: preview!.topic, source: preview!.source, questions: preview!.questions });
      toast(t('t.published', { n: r.notified }));
      setPreview(null);
    } catch (e) {
      fail(e);
    }
  };
  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{t('t.title')}</h1><p className="muted">{t('t.local')}</p></div></div>
      <div className="tests-grid">
        <section className="card stack">
          <label className="field"><span>{t('t.topic')}</span><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Present Simple" data-testid="test-topic" /></label>
          <div className="row-wrap"><span className="muted" style={{ fontSize: 12 }}>{t('t.suggest')}:</span>{SUGGEST.map((s) => <button key={s} type="button" className="btn btn-sm btn-ghost chip" onClick={() => { setTopic(s); void generate(s); }}>{s}</button>)}</div>
          <label className="field"><span>{t('t.orText')}</span><textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <label className="field"><span>{t('t.count')}: <b className="num">{count}</b></span><input type="range" min={3} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
          {hint && <div className="notice notice-bad" role="alert"><Icon name="alert" />{hint}</div>}
          <button className="btn btn-accent btn-lg" disabled={busy || (!topic.trim() && !text.trim())} onClick={() => generate()} data-testid="generate"><Icon name="sparkle" />{t('t.generate')}</button>
        </section>
        <section className="card stack" aria-live="polite">
          {!preview ? (
            <>
              <h2>{t('t.list')}</h2>
              {!list.data ? <Loading /> : list.data.map((x) => (
                <button key={x.id} className="list-row list-btn" onClick={() => setBoard(x.id)}>
                  <Icon name="tests" />
                  <span className="grow" style={{ textAlign: 'left' }}><b className="ellipsis" style={{ display: 'block' }}>{x.title}</b><span className="muted" style={{ fontSize: 12 }}>{x.groupName} · {day(x.createdAt.slice(0, 10))} · {x.questions} q</span></span>
                  <span className="badge badge-data">{t('t.attempts', { n: x.attempts, avg: x.avg ?? '—' })}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="spread"><h2>{preview.title}</h2><span className="badge">{preview.source}</span></div>
              <ol className="q-list" data-testid="test-preview">
                <AnimatePresence>
                  {preview.questions.map((q, i) => (
                    <motion.li key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <p>{q.prompt}</p>
                      <div className="q-opts">{q.options.map((o, k) => <span key={k} className={`q-opt${k === q.answer ? ' right' : ''}`}>{String.fromCharCode(65 + k)}. {o}</span>)}</div>
                      {q.explanation && <small className="muted">{q.explanation}</small>}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              <div className="row">
                <select className="select grow" value={gid} onChange={(e) => setGroupId(e.target.value)} aria-label={t('c.group')}>{groups.data?.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                <button className="btn" onClick={() => setPreview(null)}>{t('c.cancel')}</button>
                <button className="btn btn-primary" disabled={busy || !gid} onClick={publish} data-testid="publish">{t('t.publish')}</button>
              </div>
            </>
          )}
        </section>
      </div>
      <Drawer open={!!board} title={t('t.leaderboard')} onClose={() => setBoard(null)}>{board && <Leaderboard testId={board} />}</Drawer>
    </div>
  );
}

export function Leaderboard({ testId, as }: { testId: string; as?: Parameters<typeof useData>[0] }) {
  const { role } = useRole();
  const lb = useData(as ?? role, 'tests.leaderboard', { testId });
  if (!lb.data) return <Loading />;
  return (
    <div className="leaderboard">
      {lb.data.rows.map((r, i) => (
        <motion.div key={r.studentId} className={`lb-row${r.isMe ? ' me' : ''}${r.rank <= 3 ? ` top${r.rank}` : ''}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
          <span className="lb-rank num">{r.rank}</span>
          <Avatar name={r.fullName} size={28} />
          <span className="grow ellipsis">{r.fullName}</span>
          <span className="muted num" style={{ fontSize: 12 }}>{Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, '0')}</span>
          <b className="num">{r.score}</b>
        </motion.div>
      ))}
    </div>
  );
}
