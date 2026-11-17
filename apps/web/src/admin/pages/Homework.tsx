/** Homework: assign to a group, then grade what students handed in through the bot or the Mini App. */
import { motion } from 'motion/react';
import { useState } from 'react';
import { addDays } from '@ustoz/core';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Avatar, Drawer, Empty, ErrorBox, Loading, Modal, useErrorToast, useToast } from '../../ui/kit';

export default function Homework() {
  const { t, day } = useT();
  const { role } = useRole();
  const list = useData(role, 'homework.list', {});
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t('h.title')}</h1>
        <button className="btn btn-accent" onClick={() => setCreating(true)}><Icon name="plus" />{t('h.new')}</button>
      </div>
      {!list.data ? <Loading rows={6} /> : !list.data.length ? <div className="card"><Empty /></div> : (
        <div className="hw-grid">
          {list.data.map((h, i) => (
            <motion.button key={h.id} className="card hw-card" onClick={() => setOpen(h.id)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} data-testid="hw-card">
              <div className="spread"><span className="badge">{h.groupName}</span><span className={`badge ${h.dueOn < (list.data![0]?.dueOn ?? '') ? '' : 'badge-accent'}`}>{t('h.due')}: {day(h.dueOn)}</span></div>
              <b style={{ textAlign: 'left' }}>{h.title}</b>
              <div className="hw-progress"><span style={{ width: `${(100 * h.submitted) / Math.max(1, h.students)}%` }} /><span className="graded" style={{ width: `${(100 * h.graded) / Math.max(1, h.students)}%` }} /></div>
              <div className="spread muted" style={{ fontSize: 12 }}><span>{t('h.submitted', { a: h.submitted, b: h.students })}</span><span>{t('h.graded', { n: h.graded })}</span></div>
            </motion.button>
          ))}
        </div>
      )}
      <Drawer open={!!open} title={list.data?.find((h) => h.id === open)?.title ?? ''} onClose={() => setOpen(null)}>{open && <Submissions homeworkId={open} />}</Drawer>
      <NewHomework open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Submissions({ homeworkId }: { homeworkId: string }) {
  const { t, day } = useT();
  const { role } = useRole();
  const s = useData(role, 'homework.submissions', { homeworkId });
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [draft, setDraft] = useState<Record<string, { grade: string; feedback: string }>>({});
  if (!s.data) return <Loading />;
  return (
    <div className="stack">
      {s.data.rows.map((r) => {
        const d = draft[r.submissionId ?? ''] ?? { grade: r.grade?.toString() ?? '', feedback: r.feedback ?? '' };
        const setD = (v: Partial<typeof d>) => setDraft((x) => ({ ...x, [r.submissionId!]: { ...d, ...v } }));
        return (
          <div key={r.studentId} className={`card sub-card${r.submissionId ? '' : ' missing'}`} data-testid="submission">
            <div className="spread">
              <div className="row"><Avatar name={r.fullName} size={28} /><b>{r.fullName}</b></div>
              {r.submittedAt ? <span className="muted" style={{ fontSize: 12 }}>{day(r.submittedAt.slice(0, 10))}{r.kind !== 'text' && <span className="badge badge-data" style={{ marginLeft: 6 }}>{t('h.viaBot')}</span>}</span> : <span className="badge">{t('h.notSubmitted')}</span>}
            </div>
            {r.submissionId && (
              <>
                {r.body && <p className="sub-body">{r.body}</p>}
                {r.fileData?.startsWith('data:image/') && <img className="sub-img" src={r.fileData} alt={r.fileName ?? ''} />}
                {r.fileName && !r.fileData?.startsWith('data:image/') && <span className="badge"><Icon name="paperclip" size={13} />{r.fileName}</span>}
                <div className="row">
                  <input className="input" style={{ width: 80 }} type="number" min={0} max={100} placeholder="0–100" value={d.grade} onChange={(e) => setD({ grade: e.target.value })} aria-label={t('c.score')} />
                  <input className="input grow" placeholder={t('h.feedback')} value={d.feedback} onChange={(e) => setD({ feedback: e.target.value })} aria-label={t('h.feedback')} />
                  <button className="btn btn-primary" disabled={busy || d.grade === '' || Number(d.grade) < 0 || Number(d.grade) > 100} onClick={async () => {
                    try {
                      await run(role, 'homework.grade', { submissionId: r.submissionId!, grade: Math.round(Number(d.grade)), feedback: d.feedback });
                      toast(t('h.sentToFamily'));
                    } catch (e) {
                      fail(e);
                    }
                  }}>{t('h.grade')}</button>
                </div>
                <div className="row-wrap">{['Ajoyib!', 'Yaxshi, davom eting', 'Xatolar ustida ishlang'].map((f) => <button key={f} type="button" className="btn btn-sm btn-ghost" onClick={() => setD({ feedback: f })}>{f}</button>)}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewHomework({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useT();
  const { role } = useRole();
  const groups = useData(role, 'groups.list', open ? {} : null);
  const me = useData(role, 'me', {});
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [f, setF] = useState({ groupId: '', title: '', description: '', dueOn: '' });
  const gid = f.groupId || groups.data?.[0]?.id || '';
  const due = f.dueOn || (me.data ? addDays(me.data.today, 2) : '');
  return (
    <Modal open={open} title={t('h.new')} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await run(role, 'homework.create', { groupId: gid, title: f.title, description: f.description, dueOn: due });
          toast(t('h.created', { n: r.notified }));
          setF({ groupId: '', title: '', description: '', dueOn: '' });
          onClose();
        } catch (err) {
          fail(err);
        }
      }}>
        <label className="field"><span>{t('c.group')}</span><select className="select" value={gid} onChange={(e) => setF({ ...f, groupId: e.target.value })}>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="field"><span>{t('h.titleField')}</span><input className="input" required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="field"><span>{t('h.desc')}</span><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field"><span>{t('h.due')}</span><input className="input" type="date" value={due} min={me.data?.today} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></label>
        <button className="btn btn-primary btn-lg" disabled={busy || !gid}>{t('h.new')}</button>
      </form>
    </Modal>
  );
}
