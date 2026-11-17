/** Student profile: family, groups, attendance, progress chart, invoices, payments, take a payment / prepay. */
import { useState } from 'react';
import { parseSom } from '@ustoz/core';
import type { Receipt } from '@ustoz/db';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Ring, ScoreLine } from '../../ui/charts';
import { Icon } from '../../ui/icons';
import { Loading, Modal, Money, useErrorToast } from '../../ui/kit';
import { ReceiptView } from './ReceiptView';

export function StudentDetails({ studentId }: { studentId: string }) {
  const { t, day, month, money } = useT();
  const { role } = useRole();
  const s = useData(role, 'students.get', { studentId });
  const manager = role !== 'teacher';
  const st = useData(role, 'billing.statement', manager ? { studentId } : null);
  const prog = useData(role, 'progress.student', { studentId });
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [prepay, setPrepay] = useState<{ enrollmentId: string; months: number } | null>(null);
  const quote = useData(role, 'payments.prepayQuote', prepay);
  if (!s.data) return <Loading rows={6} />;
  const { student, parents, enrollments, signals, attendance } = s.data;
  const debt = st.data?.debt ?? 0;
  const pay = async () => {
    const v = parseSom(amount);
    if (!v) return;
    try {
      setReceipt(await run(role, 'payments.record', { studentId, amount: v, method }));
      setAmount('');
    } catch (e) {
      fail(e);
    }
  };
  const scores = [...(prog.data?.homework.map((h) => ({ label: h.date, v: h.grade })) ?? []), ...(prog.data?.tests.map((x) => ({ label: x.date, v: x.score })) ?? [])].sort((a, b) => (a.label < b.label ? -1 : 1));
  return (
    <div className="stack">
      <div className="card row" style={{ gap: 16 }}>
        <Ring value={signals.rate} size={70} color={signals.rate !== null && signals.rate < 0.7 ? 'var(--bad)' : 'var(--ok)'} label={t('st.attRate')} />
        <div className="grow stack-sm">
          <div className="muted">{student.phone ?? '—'}</div>
          <div className="row-wrap">
            <span className={`badge ${student.telegramLinked ? 'badge-ok' : ''}`}>{t(student.telegramLinked ? 'st.telegram' : 'st.noTelegram')}</span>
            {signals.risk.reasons.map((r) => <span key={r} className="badge badge-bad">{t(`reason.${r}`, { n: signals.streak, x: money(s.data!.finance?.overdue ?? 0) })}</span>)}
          </div>
          {parents.map((p) => <div key={p.id} className="row" style={{ fontSize: 13 }}><Icon name="students" size={14} />{p.fullName} · {p.phone}{p.telegramLinked && <span className="badge badge-ok">Telegram</span>}</div>)}
        </div>
      </div>
      <div className="card stack-sm">
        <h3>{t('s.groups')}</h3>
        {enrollments.map((e) => (
          <div key={e.id} className="spread" style={{ opacity: e.leftOn ? 0.5 : 1 }}>
            <span>{e.groupName} <span className="muted">· {day(e.joinedOn)}{e.leftOn ? ` → ${day(e.leftOn)}` : ''}</span></span>
            {manager && !e.leftOn && <button className="btn btn-sm" onClick={() => setPrepay({ enrollmentId: e.id, months: 3 })}>{t('st.prepay')}</button>}
          </div>
        ))}
        <div className="att-dots" aria-label={t('st.attRate')}>
          {attendance.map((a) => <span key={a.date} className={`att-dot ${a.status}`} title={`${day(a.date)} · ${t(`a.${a.status}`)}`} />)}
        </div>
      </div>
      {scores.length > 1 && (
        <div className="card">
          <h3>{t('mini.grades')}</h3>
          <ScoreLine points={scores} />
        </div>
      )}
      {manager && st.data && (
        <>
          <div className="card stack">
            <div className="spread"><h3>{t('st.recordPay')}</h3>{debt > 0 && <span className="badge badge-bad">{t('c.debt')}: <Money v={debt} /></span>}</div>
            <div className="row">
              <input className="input grow" inputMode="decimal" placeholder={debt ? String(debt / 100) : '0'} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('c.amount')} />
              <select className="select" style={{ width: 130 }} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>{(['cash', 'card', 'transfer'] as const).map((m) => <option key={m} value={m}>{t(`m.${m}`)}</option>)}</select>
              <button className="btn btn-primary" disabled={busy || !parseSom(amount)} onClick={pay} data-testid="take-payment">{t('c.save')}</button>
            </div>
            {debt > 0 && <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setAmount(String(debt / 100))}>{money(debt)}</button>}
          </div>
          <div className="card">
            <h3>{t('st.invoices')}</h3>
            <table className="table">
              <tbody>
                {[...st.data.invoices].reverse().map((i) => (
                  <tr key={i.id}>
                    <td>{month(i.month)}<div className="muted" style={{ fontSize: 12 }}>{i.groupName} · {t('st.lessonsBilled', { a: i.lessonsBilled, b: i.lessonsInMonth })}{i.discounts.map((d) => ` · −${money(d.amount)} ${t(`disc.${d.kind}`)}`).join('')}</div></td>
                    <td className="num" style={{ textAlign: 'right' }}><Money v={i.total} /></td>
                    <td style={{ textAlign: 'right' }}><span className={`badge ${i.status === 'paid' ? 'badge-ok' : i.status === 'partial' ? 'badge-warn' : 'badge-bad'}`}>{t(`c.${i.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>{t('st.payments')}</h3>
            {st.data.payments.map((p) => (
              <div key={p.id} className="list-row">
                <span className="badge">{t(`m.${p.method}`)}</span>
                <span className="grow muted">{p.paidAt ? day(p.paidAt.slice(0, 10)) : '…'} · {p.receiptNo}</span>
                <b><Money v={p.amount} /></b>
              </div>
            ))}
          </div>
        </>
      )}
      <Modal open={!!receipt} title={t('b.receipt')} onClose={() => setReceipt(null)}>{receipt && <ReceiptView r={receipt} />}</Modal>
      <Modal open={!!prepay} title={t('st.prepay')} onClose={() => setPrepay(null)}>
        {prepay && (
          <div className="stack">
            <div className="row-wrap">{[3, 6, 12].map((m) => <button key={m} className={`btn ${prepay.months === m ? 'btn-primary' : ''}`} onClick={() => setPrepay({ ...prepay, months: m })}>{m}</button>)}</div>
            {quote.data ? (
              <>
                <div className="spread"><span>{t('st.prepayMonths', { n: quote.data.months, p: quote.data.bp / 100 })}</span><s className="muted"><Money v={quote.data.full} /></s></div>
                <div className="spread"><b>{t('c.amount')}</b><b style={{ fontSize: 20 }}><Money v={quote.data.total} /></b></div>
                <button className="btn btn-accent btn-lg" disabled={busy} onClick={async () => {
                  try {
                    const r = await run(role, 'payments.prepay', { ...prepay, method: 'card' });
                    setPrepay(null);
                    setReceipt(r.receipt);
                  } catch (e) {
                    fail(e);
                  }
                }}>{t('mini.pay')}</button>
              </>
            ) : <Loading rows={2} />}
          </div>
        )}
      </Modal>
    </div>
  );
}
