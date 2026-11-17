/** Mini App tests: pick a test → one question per screen → instant grading → leaderboard. */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useAction, useApi, useData } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Empty, Loading, useErrorToast } from '../../ui/kit';
import { Leaderboard } from '../../admin/pages/Tests';
import { Ring } from '../../ui/charts';

type Taken = { title: string; questions: Array<{ id: string; prompt: string; options: string[] }> };
type Result = { correct: number; total: number; score: number; review: Array<{ id: string; answer: number; explanation: string | null }> };

export function TestsScreen() {
  const { t } = useT();
  const list = useData('student', 'tests.mine', {});
  const [active, setActive] = useState<string | null>(null);
  const [board, setBoard] = useState<string | null>(null);
  if (active) return <TakeTest testId={active} onExit={() => setActive(null)} />;
  if (board) {
    return (
      <div className="mini-pad stack">
        <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setBoard(null)}><Icon name="back" size={15} />{t('c.back')}</button>
        <h2>{t('t.leaderboard')}</h2>
        <Leaderboard testId={board} as="student" />
      </div>
    );
  }
  if (!list.data) return <div className="mini-pad"><Loading /></div>;
  return (
    <div className="mini-pad stack">
      <h2>{t('mini.tests')}</h2>
      {!list.data.length && <Empty />}
      {list.data.map((x) => (
        <div key={x.id} className={`mini-card mini-test${x.attempted ? ' done' : ''}`} data-testid="mini-test">
          <div className="spread"><span className="muted" style={{ fontSize: 12 }}>{x.groupName} · {x.questions} q</span>{x.attempted && <span className="badge badge-ok">{x.score}</span>}</div>
          <b>{x.title}</b>
          {x.attempted ? <button className="btn btn-sm" onClick={() => setBoard(x.id)}>{t('t.leaderboard')}</button> : <button className="btn btn-accent" onClick={() => setActive(x.id)} data-testid="start-test"><Icon name="sparkle" size={15} />{t('mini.startTest')}</button>}
        </div>
      ))}
    </div>
  );
}

function TakeTest({ testId, onExit }: { testId: string; onExit(): void }) {
  const { t } = useT();
  const api = useApi();
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const [test, setTest] = useState<Taken | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(Date.now());
  useEffect(() => {
    api.call('student', 'tests.get', { testId }).then((x) => setTest(x), fail);
  }, [api, testId, fail]);
  if (!test) return <div className="mini-pad"><Loading /></div>;
  const q = test.questions[i]!;
  const last = i === test.questions.length - 1;
  const finish = async () => {
    try {
      setResult(await run('student', 'tests.submit', { testId, answers, durationSec: Math.round((Date.now() - started.current) / 1000) }));
    } catch (e) {
      fail(e);
    }
  };
  if (result) {
    return (
      <div className="mini-pad stack" data-testid="test-result">
        <motion.div className="test-score" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Ring value={result.score / 100} size={120} color={result.score >= 70 ? 'var(--ok)' : 'var(--accent)'} />
          <b>{t('mini.result', { c: result.correct, t: result.total })}</b>
        </motion.div>
        {test.questions.map((qq, k) => {
          const right = result.review[k]!.answer;
          const mine = answers[qq.id];
          return (
            <div key={qq.id} className={`mini-card review ${mine === right ? 'ok' : 'bad'}`}>
              <span className="muted" style={{ fontSize: 12 }}>{k + 1}. {qq.prompt}</span>
              <b>{t('t.answer')}: {qq.options[right]}</b>
              {result.review[k]!.explanation && <small className="muted">{result.review[k]!.explanation}</small>}
            </div>
          );
        })}
        <button className="btn btn-primary btn-lg btn-block" onClick={onExit}>{t('c.back')}</button>
      </div>
    );
  }
  return (
    <div className="mini-pad stack take">
      <div className="spread">
        <button className="btn btn-sm btn-ghost" onClick={onExit}><Icon name="back" size={15} />{t('c.back')}</button>
        <span className="muted num">{t('mini.question', { a: i + 1, b: test.questions.length })}</span>
      </div>
      <div className="take-progress"><motion.span animate={{ width: `${((i + 1) * 100) / test.questions.length}%` }} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} className="stack" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
          <h2 className="take-q">{q.prompt}</h2>
          <div className="take-opts" role="radiogroup">
            {q.options.map((o, k) => (
              <motion.button key={k} whileTap={{ scale: 0.97 }} role="radio" aria-checked={answers[q.id] === k} className={`take-opt${answers[q.id] === k ? ' on' : ''}`} onClick={() => setAnswers({ ...answers, [q.id]: k })} data-testid="option">
                <span className="take-letter">{String.fromCharCode(65 + k)}</span>{o}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="take-nav">
        {i > 0 && <button className="btn btn-lg" onClick={() => setI(i - 1)}><Icon name="back" /></button>}
        {last ? (
          <button className="btn btn-accent btn-lg grow" disabled={busy || answers[q.id] === undefined} onClick={finish} data-testid="finish-test">{t('mini.finish')}</button>
        ) : (
          <button className="btn btn-primary btn-lg grow" disabled={answers[q.id] === undefined} onClick={() => setI(i + 1)} data-testid="next-question">{t('mini.next.q')}</button>
        )}
      </div>
    </div>
  );
}

