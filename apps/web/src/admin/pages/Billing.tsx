/** Billing: month totals, payment methods, debtors with one-tap bot reminders, recent receipts. */
import { useState } from 'react';
import { addMonths } from '@ustoz/core';
import type { Receipt } from '@ustoz/db';
import { useAction, useApi, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { HBars, Ring } from '../../ui/charts';
import { Icon } from '../../ui/icons';
import { Avatar, ErrorBox, Loading, Modal, Money, Ticker, useErrorToast, useToast } from '../../ui/kit';
import { ReceiptView } from './ReceiptView';

const METHOD_COLOR: Record<string, string> = { cash: '#6c6b76', card: '#3f3cbb', transfer: '#0e7490', payme: '#00b8c8', click: '#0a6cff', uzum: '#7b2ff7' };

export default function Billing() {
  const { t, month: monthName, money } = useT();
  const { role } = useRole();
  const api = useApi();
  const me = useData(role, 'me', {});
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? me.data?.today.slice(0, 7) ?? null;
  const ov = useData(role, 'billing.overview', m ? { month: m } : null);
  const debtors = useData(role, 'billing.debtors', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  if (ov.error) return <ErrorBox error={ov.error} retry={ov.reload} />;
  const remind = async (ids?: string[]) => {
    try {
      const r = await run(role, 'billing.remind', ids ? { studentIds: ids } : {});
      toast(t('b.reminded', { n: r.students }));
    } catch (e) {
      fail(e);
    }
  };
  const rate = ov.data && ov.data.billed ? ov.data.collected / ov.data.billed : null;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('b.title')}</h1>
          {m && <p className="muted">{monthName(m)}</p>}
        </div>
        <div className="row-wrap">
          <div className="row">
            <button className="btn icon-btn" aria-label="−1" onClick={() => m && setMonth(addMonths(m, -1))}><Icon name="back" /></button>
            <button className="btn icon-btn" aria-label="+1" onClick={() => m && setMonth(addMonths(m, 1))}><Icon name="next" /></button>
          </div>
          <button className="btn" disabled={busy || !m} onClick={async () => {
            try {
              const r = await run(role, 'billing.run', { month: m! });
              toast(t('b.ran', { n: r.created }));
            } catch (e) {
              fail(e);
            }
          }}>{t('b.runMonth')}</button>
        </div>
      </div>
      {!ov.data ? <Loading rows={4} /> : (
        <div className="kpis">
          <div className="card kpi kpi-accent"><span className="kpi-label">{t('b.collected')}</span><div className="kpi-value"><Ticker value={ov.data.collected} format={money} /></div><span className="kpi-foot muted">{ov.data.payments} {t('st.payments').toLowerCase()}</span></div>
          <div className="card kpi kpi-data"><span className="kpi-label">{t('b.billed')}</span><div className="kpi-value"><Ticker value={ov.data.billed} format={money} /></div><span className="kpi-foot muted">{ov.data.invoices} {t('st.invoices').toLowerCase()}</span></div>
          <div className="card kpi kpi-ok row" style={{ gap: 14 }}><Ring value={rate} size={66} /><div><span className="kpi-label">{t('b.rate')}</span><p className="muted" style={{ fontSize: 12 }}>{t('b.collected')} / {t('b.billed')}</p></div></div>
          <div className="card kpi"><span className="kpi-label">{t('b.byMethod')}</span><HBars rows={ov.data.byMethod.map((x) => ({ label: t(`m.${x.method}`), v: x.amount, color: METHOD_COLOR[x.method] }))} format={(v) => money(v)} /></div>
        </div>
      )}
      <div className="bill-grid">
        <section className="card" data-testid="debtors">
          <div className="card-title">
            <h2>{t('b.debtors')} · {debtors.data?.length ?? '…'}</h2>
            <button className="btn btn-sm btn-accent" disabled={busy} onClick={() => remind()}><Icon name="send" size={15} />{t('b.remindAll')}</button>
          </div>
          {!debtors.data ? <Loading /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('c.name')}</th><th>{t('c.debt')}</th><th>{t('c.overdue')}</th><th /></tr></thead>
                <tbody>
                  {debtors.data.slice(0, 40).map((d) => (
                    <tr key={d.id}>
                      <td><div className="row"><Avatar name={d.fullName} size={26} /><div><b className="ellipsis">{d.fullName}</b><div className="muted" style={{ fontSize: 12 }}>{d.groups}</div></div></div></td>
                      <td className="num"><Money v={d.debt} /></td>
                      <td className="num">{d.overdue > 0 ? <span className="text-bad"><Money v={d.overdue} /></span> : <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => remind([d.id])} aria-label={`${t('d.remind')}: ${d.fullName}`}><Icon name="bell" size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-title"><h2>{t('b.recent')}</h2></div>
          {ov.data?.recent.map((p) => (
            <button key={p.id} className="list-row list-btn" onClick={async () => setReceipt(await api.call(role, 'payments.receipt', { paymentId: p.id }))}>
              <span className="badge" style={{ background: `${METHOD_COLOR[p.method]}22`, color: METHOD_COLOR[p.method] }}>{t(`m.${p.method}`)}</span>
              <span className="grow ellipsis" style={{ textAlign: 'left' }}>{p.studentName}<span className="muted" style={{ display: 'block', fontSize: 12 }}>{p.receiptNo}</span></span>
              <b><Money v={p.amount} /></b>
            </button>
          ))}
        </section>
      </div>
      <Modal open={!!receipt} title={t('b.receipt')} onClose={() => setReceipt(null)}>{receipt && <ReceiptView r={receipt} />}</Modal>
    </div>
  );
}
