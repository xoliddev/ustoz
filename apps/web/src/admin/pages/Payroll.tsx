/** Monthly payroll: every teacher's payslip from their pay rule; the director can change the rule. */
import { useState } from 'react';
import { addMonths, parseSom, type SalaryScheme } from '@ustoz/core';
import type { PayrollRow } from '@ustoz/db';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Avatar, ErrorBox, Loading, Modal, Money, Seg, Ticker, useErrorToast, useToast } from '../../ui/kit';

function Slip({ row, onEdit }: { row: PayrollRow; onEdit?(): void }) {
  const { t, money } = useT();
  const p = row.payslip;
  const rule = row.rule.scheme === 'fixed' ? money(row.rule.amount) : row.rule.scheme === 'per_student' ? `${money(row.rule.amount)} × ${p.students}` : `${row.rule.bp / 100}% × ${money(p.collected)}`;
  return (
    <div className="card slip" data-testid="payslip">
      <div className="spread">
        <div className="row"><Avatar name={row.fullName} /><div><b>{row.fullName}</b><div className="muted" style={{ fontSize: 12 }}>{t(`p.scheme.${row.rule.scheme}`)} · {rule}</div></div></div>
        <div className="row"><b style={{ fontSize: 18 }}><Money v={p.total} /></b>{onEdit && <button className="btn btn-sm btn-ghost" onClick={onEdit} aria-label={t('p.edit')}><Icon name="payroll" size={15} /></button>}</div>
      </div>
      {p.lines.length > 0 && row.rule.scheme !== 'fixed' && (
        <div className="slip-lines">
          {p.lines.map((l) => (
            <div key={l.groupId ?? l.label} className="spread">
              <span className="muted">{l.label}</span>
              <span className="num">{row.rule.scheme === 'per_student' ? `${l.basis} ${t('c.students')}` : money(Number(l.basis))} → <b><Money v={l.amount} /></b></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Payroll() {
  const { t, month: monthName, moneyShort } = useT();
  const { role } = useRole();
  const me = useData(role, 'me', {});
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? me.data?.today.slice(0, 7) ?? null;
  const director = role === 'director';
  const report = useData(role, 'payroll.report', director && m ? { month: m } : null);
  const mine = useData(role, 'payroll.mine', !director && m ? { month: m } : null);
  const [edit, setEdit] = useState<PayrollRow | null>(null);
  const err = report.error ?? mine.error;
  if (err) return <ErrorBox error={err} />;
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{director ? t('p.title') : t('p.mine')}</h1>
          {m && <p className="muted">{monthName(m)}</p>}
        </div>
        <div className="row">
          <button className="btn icon-btn" aria-label="−1" onClick={() => m && setMonth(addMonths(m, -1))}><Icon name="back" /></button>
          <button className="btn icon-btn" aria-label="+1" onClick={() => m && setMonth(addMonths(m, 1))}><Icon name="next" /></button>
        </div>
      </div>
      {director ? (
        !report.data ? <Loading rows={6} /> : (
          <>
            <div className="kpis">
              <div className="card kpi kpi-accent"><span className="kpi-label">{t('p.total')}</span><div className="kpi-value"><Ticker value={report.data.total} format={moneyShort} /></div></div>
              <div className="card kpi kpi-data"><span className="kpi-label">{t('b.collected')}</span><div className="kpi-value"><Money v={report.data.collected} /></div></div>
              <div className="card kpi"><span className="kpi-label">{t('p.share')}</span><div className="kpi-value num">{report.data.collected ? `${Math.round((report.data.total * 100) / report.data.collected)}%` : '—'}</div></div>
            </div>
            <div className="slips">{report.data.rows.map((r) => <Slip key={r.teacherId} row={r} onEdit={() => setEdit(r)} />)}</div>
          </>
        )
      ) : !mine.data ? <Loading /> : <Slip row={mine.data} />}
      <Modal open={!!edit} title={t('p.edit')} onClose={() => setEdit(null)}>{edit && <RuleForm row={edit} onDone={() => setEdit(null)} />}</Modal>
    </div>
  );
}

function RuleForm({ row, onDone }: { row: PayrollRow; onDone(): void }) {
  const { t } = useT();
  const { role } = useRole();
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [scheme, setScheme] = useState<SalaryScheme>(row.rule.scheme);
  const [amount, setAmount] = useState(String(row.rule.amount / 100));
  const [pct, setPct] = useState(String(row.rule.bp / 100));
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await run(role, 'teachers.salary', { teacherId: row.teacherId, scheme, amount: scheme === 'percent' ? 0 : parseSom(amount) ?? 0, bp: scheme === 'percent' ? Math.round(Number(pct) * 100) : 0 });
        toast(t('c.saved'));
        onDone();
      } catch (err) {
        fail(err);
      }
    }}>
      <b>{row.fullName}</b>
      <Seg value={scheme} onChange={setScheme} options={(['fixed', 'per_student', 'percent'] as const).map((s) => ({ v: s, label: t(`p.scheme.${s}`) }))} />
      {scheme === 'percent' ? (
        <label className="field"><span>{t('p.percent')}</span><input className="input" type="number" min={0} max={100} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} /></label>
      ) : (
        <label className="field"><span>{t('p.amount')}</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      )}
      <button className="btn btn-primary btn-lg" disabled={busy}>{t('c.save')}</button>
    </form>
  );
}
