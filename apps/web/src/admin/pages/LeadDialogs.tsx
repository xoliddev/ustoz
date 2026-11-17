/** Lead dialogs: new application, placement score, trial lesson booking and enrolment. */
import { useState, type FormEvent } from 'react';
import { addDays, datesOn, levelFor } from '@ustoz/core';
import type { LeadRow } from '@ustoz/db';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Modal, useErrorToast } from '../../ui/kit';

export type LeadDialog = { kind: 'create' } | { kind: 'placement' | 'trial' | 'enroll'; lead: LeadRow };

export function LeadDialogs({ dialog, onClose, onDone }: { dialog: LeadDialog | null; onClose(): void; onDone(msg?: string): void }) {
  const { t } = useT();
  const title = !dialog ? '' : dialog.kind === 'create' ? t('l.new') : dialog.kind === 'placement' ? t('l.stage.placement') : dialog.kind === 'trial' ? t('l.stage.trial') : t('l.enroll');
  return (
    <Modal open={!!dialog} title={title} onClose={onClose}>
      {dialog?.kind === 'create' && <CreateLead onDone={onDone} />}
      {dialog?.kind === 'placement' && <Placement lead={dialog.lead} onDone={onDone} />}
      {dialog?.kind === 'trial' && <Trial lead={dialog.lead} onDone={onDone} />}
      {dialog?.kind === 'enroll' && <Enroll lead={dialog.lead} onDone={onDone} />}
    </Modal>
  );
}

function CreateLead({ onDone }: { onDone(msg?: string): void }) {
  const { t } = useT();
  const { role } = useRole();
  const st = useData(role, 'org.structure', {});
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const [f, setF] = useState({ fullName: '', phone: '', courseId: '', source: 'instagram' as const });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await run(role, 'leads.create', { fullName: f.fullName, phone: f.phone, courseId: f.courseId || null, source: f.source });
      onDone(t('c.saved'));
    } catch (err) {
      fail(err);
    }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field"><span>{t('c.name')}</span><input className="input" required minLength={2} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
      <label className="field"><span>{t('c.phone')}</span><input className="input" required inputMode="tel" placeholder="+998 90 123 45 67" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label className="field"><span>{t('c.course')}</span>
        <select className="select" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
          <option value="">—</option>
          {st.data?.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field"><span>{t('l.source')}</span>
        <select className="select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as typeof f.source })}>
          {(['instagram', 'telegram', 'referral', 'google', 'walk_in'] as const).map((s) => <option key={s} value={s}>{t(`src.${s}`)}</option>)}
        </select>
      </label>
      <button className="btn btn-primary btn-lg" disabled={busy}>{t('c.save')}</button>
    </form>
  );
}

function Placement({ lead, onDone }: { lead: LeadRow; onDone(msg?: string): void }) {
  const { t } = useT();
  const { role } = useRole();
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const [score, setScore] = useState(lead.placementScore ?? 50);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await run(role, 'leads.placement', { leadId: lead.id, score });
        onDone(t('c.saved'));
      } catch (err) {
        fail(err);
      }
    }}>
      <b>{lead.fullName}</b>
      <label className="field"><span>{t('l.placementScore')}: <b className="num">{score}</b></span><input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} /></label>
      <div className="row"><span className="muted">{t('l.level')}:</span><span className="badge badge-data">{t(`lvl.${levelFor(score)}`)}</span></div>
      <button className="btn btn-primary btn-lg" disabled={busy}>{t('c.save')}</button>
    </form>
  );
}

function Trial({ lead, onDone }: { lead: LeadRow; onDone(msg?: string): void }) {
  const { t, day, wd } = useT();
  const { role } = useRole();
  const groups = useData(role, 'groups.list', {});
  const me = useData(role, 'me', {});
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const options = (groups.data ?? []).filter((g) => g.status === 'active' && (!lead.courseId || g.courseId === lead.courseId));
  const [groupId, setGroupId] = useState(lead.trialGroupId ?? '');
  const gid = groupId || options[0]?.id || '';
  const g = groups.data?.find((x) => x.id === gid);
  const today = me.data?.today ?? '';
  const dates = g && today ? datesOn(g.days, today > g.startsOn ? today : g.startsOn, addDays(today, 14)).slice(0, 5) : [];
  const [date, setDate] = useState('');
  const chosen = date && dates.includes(date) ? date : dates[0] ?? '';
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await run(role, 'leads.trial', { leadId: lead.id, groupId: gid, date: chosen });
        onDone(t('c.saved'));
      } catch (err) {
        fail(err);
      }
    }}>
      <b>{lead.fullName}</b>
      <label className="field"><span>{t('l.trialGroup')}</span>
        <select className="select" value={gid} onChange={(e) => setGroupId(e.target.value)}>
          {(options.length ? options : groups.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.courseName}</option>)}
        </select>
      </label>
      <div className="field"><span>{t('l.trialDate')}</span>
        <div className="row-wrap">{dates.map((d) => <button type="button" key={d} className={`btn btn-sm ${d === chosen ? 'btn-primary' : ''}`} onClick={() => setDate(d)}>{wd(d)}, {day(d)}</button>)}</div>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy || !gid || !chosen}>{t('c.save')}</button>
    </form>
  );
}

function Enroll({ lead, onDone }: { lead: LeadRow; onDone(msg?: string): void }) {
  const { t, money } = useT();
  const { role } = useRole();
  const groups = useData(role, 'groups.list', {});
  const { run, busy } = useAction();
  const fail = useErrorToast();
  const [groupId, setGroupId] = useState(lead.trialGroupId ?? '');
  const [parent, setParent] = useState({ fullName: '', phone: '' });
  const gid = groupId || groups.data?.[0]?.id || '';
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      try {
        const r = await run(role, 'leads.enroll', { leadId: lead.id, groupId: gid, parent: parent.fullName && parent.phone ? parent : null });
        onDone(t('l.enrolled', { name: lead.fullName, amount: money(r.enrollment.invoice?.total ?? 0) }));
      } catch (err) {
        fail(err);
      }
    }}>
      <b>{lead.fullName}</b>
      <label className="field"><span>{t('c.group')}</span>
        <select className="select" value={gid} onChange={(e) => setGroupId(e.target.value)}>
          {groups.data?.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.name} · {g.students}/{g.capacity}</option>)}
        </select>
      </label>
      <label className="field"><span>{t('c.parent')} — {t('c.name')}</span><input className="input" value={parent.fullName} onChange={(e) => setParent({ ...parent, fullName: e.target.value })} /></label>
      <label className="field"><span>{t('c.parent')} — {t('c.phone')}</span><input className="input" inputMode="tel" value={parent.phone} onChange={(e) => setParent({ ...parent, phone: e.target.value })} /></label>
      <button className="btn btn-accent btn-lg" disabled={busy || !gid}>{t('l.enroll')}</button>
    </form>
  );
}
