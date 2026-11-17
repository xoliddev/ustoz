/** Director dashboard: money, attendance, churn risk and teacher load at a glance. */
import { motion } from 'motion/react';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { HBars, PairBars, Ring } from '../../ui/charts';
import { Icon } from '../../ui/icons';
import { Avatar, ErrorBox, Loading, Ticker, useErrorToast, useToast } from '../../ui/kit';

export default function Dashboard() {
  const { t, moneyShort, month, monthShort, l } = useT();
  const { role } = useRole();
  const { data: d, error, reload } = useData(role, 'dashboard.summary', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!d) return <Loading rows={8} />;
  const thisMonth = d.revenue.at(-1)!;
  const remind = async (ids?: string[]) => {
    try {
      const r = await run(role, 'billing.remind', ids ? { studentIds: ids } : {});
      toast(t('b.reminded', { n: r.students }));
    } catch (e) {
      fail(e);
    }
  };
  const reasonText = (r: string, s: (typeof d.risk)[number]) => (r === 'missed_streak' ? t('reason.missed_streak', { n: s.streak }) : r === 'overdue_debt' ? t('reason.overdue_debt', { x: moneyShort(s.overdue) }) : t(`reason.${r}`));
  const kpis = [
    { key: 'rev', label: t('d.revenue'), value: <Ticker value={thisMonth.collected} format={moneyShort} />, foot: `${t('d.billed')}: ${moneyShort(thisMonth.billed)}`, icon: 'wallet' as const, tone: 'accent' },
    { key: 'debt', label: t('d.debts'), value: <Ticker value={d.debt} format={moneyShort} />, foot: t('d.debtors', { n: d.debtors }), icon: 'alert' as const, tone: 'bad' },
    { key: 'att', label: t('d.attendance'), value: <span className="num">{d.attendance.rate === null ? '—' : `${Math.round(d.attendance.rate * 100)}%`}</span>, foot: d.attendance.weeks.map((w) => (w.rate === null ? '—' : `${Math.round(w.rate * 100)}%`)).join(' · '), icon: 'attendance' as const, tone: 'ok' },
    { key: 'act', label: t('d.active'), value: <Ticker value={d.activeStudents} format={(v) => String(v)} />, foot: t('d.leads', { open: d.leads.open, new: d.leads.new7 }), icon: 'students' as const, tone: 'data' },
  ];
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('d.title')}</h1>
          <p className="muted">{month(d.month)}</p>
        </div>
      </div>
      <div className="kpis">
        {kpis.map((k, i) => (
          <motion.div key={k.key} className={`card kpi kpi-${k.tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} data-testid={`kpi-${k.key}`}>
            <div className="spread"><span className="kpi-label">{k.label}</span><Icon name={k.icon} /></div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-foot muted ellipsis">{k.foot}</div>
          </motion.div>
        ))}
      </div>
      <div className="dash-grid">
        <section className="card">
          <div className="card-title">
            <h2>{t('d.revenueChart')}</h2>
            <span className="row muted" style={{ fontSize: 12 }}><i className="lg lg-a" />{t('d.billed')} <i className="lg lg-b" />{t('d.collected')}</span>
          </div>
          <PairBars data={d.revenue.map((r) => ({ a: r.billed, b: r.collected }))} labels={d.revenue.map((r) => monthShort(r.month))} format={(v) => moneyShort(v)} />
        </section>
        <section className="card">
          <div className="card-title"><h2>{t('d.attendance')}</h2></div>
          <div className="row" style={{ gap: 18, justifyContent: 'space-around' }}>
            {d.attendance.weeks.map((w, i) => (
              <div key={w.from} className="stack-sm" style={{ justifyItems: 'center' }}>
                <Ring value={w.rate} size={i === 3 ? 84 : 58} color={i === 3 ? 'var(--ok)' : 'var(--data)'} />
                <small className="muted">{w.from.slice(5).replace('-', '.')}–{w.to.slice(5).replace('-', '.')}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="card" data-testid="risk-list">
          <div className="card-title">
            <div>
              <h2>{t('d.risk')} · {d.riskCount}</h2>
              <p className="muted" style={{ fontSize: 12 }}>{t('d.riskHint')}</p>
            </div>
            <button className="btn btn-sm" disabled={busy} onClick={() => remind(d.risk.filter((r) => r.overdue > 0).map((r) => r.id))}><Icon name="bell" />{t('d.remind')}</button>
          </div>
          <div className="risk-list">
            {d.risk.map((s, i) => (
              <motion.div key={s.id} className="risk-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
                <Avatar name={s.fullName} />
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{s.fullName}</div>
                  <div className="muted ellipsis" style={{ fontSize: 12 }}>{s.groups.join(', ')}</div>
                </div>
                <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
                  {s.reasons.map((r) => <span key={r} className={`badge ${r === 'overdue_debt' ? 'badge-bad' : 'badge-warn'}`}>{reasonText(r, s)}</span>)}
                </div>
                <div className="risk-score num" title="risk score" style={{ ['--s' as string]: `${s.score}%` }}>{s.score}</div>
              </motion.div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-title"><h2>{t('d.load')}</h2></div>
          <HBars rows={d.load.map((x) => ({ label: x.fullName, v: Math.round(x.minutes / 6) / 10, color: x.color, note: `${x.groups} ${t('c.groups')}, ${x.students} ${t('c.students')}` }))} format={(v) => `${v.toLocaleString(l === 'en' ? 'en' : 'ru')} ${t('d.hoursWeek')}`} />
        </section>
      </div>
    </div>
  );
}
