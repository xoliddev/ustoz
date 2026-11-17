/** Students: searchable list with attendance, debt and churn-risk signals; profile drawer. */
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Avatar, Drawer, ErrorBox, Loading, Modal, Money, Seg, useErrorToast, useToast } from '../../ui/kit';
import { StudentDetails } from './StudentDetails';

export default function Students() {
  const { t } = useT();
  const { role } = useRole();
  const list = useData(role, 'students.list', {});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'risk' | 'debt'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data ?? [])
      .filter((r) => !s || r.fullName.toLowerCase().includes(s) || (r.phone ?? '').includes(s) || r.groups.some((g) => g.name.toLowerCase().includes(s)))
      .filter((r) => filter === 'all' || (filter === 'risk' ? r.risk.level === 'high' : r.debt > 0))
      .sort((a, b) => (filter === 'all' ? a.fullName.localeCompare(b.fullName) : b.risk.score - a.risk.score || b.debt - a.debt));
  }, [list.data, q, filter]);
  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  const manager = role !== 'teacher';
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('st.title')}</h1>
          <p className="muted">{list.data?.length ?? '…'} {t('c.students')}</p>
        </div>
        <div className="row-wrap">
          <Seg value={filter} onChange={setFilter} options={[{ v: 'all', label: t('c.all') }, { v: 'risk', label: t('st.filter.risk') }, ...(manager ? [{ v: 'debt' as const, label: t('st.filter.debt') }] : [])]} />
          <input className="input" style={{ width: 220 }} placeholder={t('c.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('c.search')} />
          {manager && <button className="btn btn-accent" onClick={() => setAdding(true)}><Icon name="plus" />{t('st.add')}</button>}
        </div>
      </div>
      {!list.data ? (
        <Loading rows={10} />
      ) : (
        <div className="card-flat table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('c.name')}</th><th>{t('c.group')}</th><th>{t('st.attRate')}</th>{manager && <th>{t('c.debt')}</th>}<th /></tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <motion.tr key={r.id} className="click" onClick={() => setOpen(r.id)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.012 }} data-testid="student-row">
                  <td><div className="row"><Avatar name={r.fullName} size={28} /><span className="ellipsis" style={{ fontWeight: 600 }}>{r.fullName}</span></div></td>
                  <td className="muted">{r.groups.map((g) => g.name).join(', ') || '—'}</td>
                  <td><span className={`num ${r.rate !== null && r.rate < 0.7 ? 'text-bad' : ''}`}>{r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}</span>{r.streak >= 2 && <span className="badge badge-warn" style={{ marginLeft: 6 }}>{t('a.streak', { n: r.streak })}</span>}</td>
                  {manager && <td>{r.debt > 0 ? <span className={r.overdue > 0 ? 'text-bad' : ''}><Money v={r.debt} /></span> : <span className="faint">—</span>}</td>}
                  <td style={{ textAlign: 'right' }}>{r.risk.level === 'high' && <span className="badge badge-bad">{t('st.filter.risk')}</span>}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={!!open} title={list.data?.find((x) => x.id === open)?.fullName ?? ''} onClose={() => setOpen(null)}>
        {open && <StudentDetails studentId={open} />}
      </Drawer>
      <AddStudent open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddStudent({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useT();
  const { role } = useRole();
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [f, setF] = useState({ fullName: '', phone: '', parentName: '', parentPhone: '' });
  return (
    <Modal open={open} title={t('st.add')} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await run(role, 'students.create', { fullName: f.fullName, phone: f.phone || null, parent: f.parentName && f.parentPhone ? { fullName: f.parentName, phone: f.parentPhone } : null });
          toast(t('c.saved'));
          setF({ fullName: '', phone: '', parentName: '', parentPhone: '' });
          onClose();
        } catch (err) {
          fail(err);
        }
      }}>
        <label className="field"><span>{t('c.name')}</span><input className="input" required minLength={2} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
        <label className="field"><span>{t('c.phone')}</span><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="field"><span>{t('c.parent')} — {t('c.name')}</span><input className="input" value={f.parentName} onChange={(e) => setF({ ...f, parentName: e.target.value })} /></label>
        <label className="field"><span>{t('c.parent')} — {t('c.phone')}</span><input className="input" inputMode="tel" value={f.parentPhone} onChange={(e) => setF({ ...f, parentPhone: e.target.value })} /></label>
        <button className="btn btn-primary btn-lg" disabled={busy}>{t('c.save')}</button>
      </form>
    </Modal>
  );
}
