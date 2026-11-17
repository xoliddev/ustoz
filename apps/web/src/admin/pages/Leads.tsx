/** Lead funnel as a kanban board (drag a card to the next stage) with conversion stats. */
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import type { LeadStage } from '@ustoz/core';
import type { LeadRow } from '@ustoz/db';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { ErrorBox, Loading, useErrorToast, useToast } from '../../ui/kit';
import { LeadDialogs, type LeadDialog } from './LeadDialogs';

const STAGES: LeadStage[] = ['new', 'placement', 'trial', 'enrolled', 'lost'];

export default function Leads() {
  const { t, day } = useT();
  const { role } = useRole();
  const leads = useData(role, 'leads.list', {});
  const stats = useData(role, 'leads.stats', {});
  const { run } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [dialog, setDialog] = useState<LeadDialog | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  if (leads.error) return <ErrorBox error={leads.error} retry={leads.reload} />;
  const rows = leads.data;

  /** What dropping a card on a column means. */
  const moveTo = async (l: LeadRow, to: LeadStage) => {
    if (to === l.stage) return;
    if (to === 'placement') return setDialog({ kind: 'placement', lead: l });
    if (to === 'trial') return setDialog({ kind: 'trial', lead: l });
    if (to === 'enrolled') return setDialog({ kind: 'enroll', lead: l });
    try {
      await run(role, 'leads.move', { leadId: l.id, to, ...(to === 'lost' ? { lostReason: '' } : {}) });
    } catch (e) {
      fail(e);
    }
  };

  const stageAt = (x: number, y: number): LeadStage | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const s = (el as HTMLElement).dataset?.stage as LeadStage | undefined;
      if (s) return s;
    }
    return null;
  };

  const funnel = stats.data?.funnel ?? [];
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{t('l.title')}</h1>
          <p className="muted">{t('l.dragHint')}</p>
        </div>
        <button className="btn btn-accent" onClick={() => setDialog({ kind: 'create' })}><Icon name="plus" />{t('l.new')}</button>
      </div>
      {stats.data && (
        <div className="card funnel" data-testid="funnel">
          {funnel.map((f, i) => (
            <div key={f.stage} className="funnel-step">
              <div className="funnel-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(4, f.rate * 100)}%` }} transition={{ duration: 0.8, delay: i * 0.08 }} /></div>
              <div className="spread"><b>{t(`l.stage.${f.stage}`)}</b><span className="num">{f.count} · {Math.round(f.rate * 100)}%</span></div>
            </div>
          ))}
          <div className="funnel-summary">
            <span className="muted">{t('l.conversion')}</span>
            <strong className="num">{Math.round((funnel.at(-1)?.rate ?? 0) * 100)}%</strong>
            <span className="muted">{t('l.ofLeads', { n: stats.data.total })}</span>
          </div>
        </div>
      )}
      {!rows ? (
        <Loading rows={5} />
      ) : (
        <LayoutGroup>
          <div className="kanban">
            {STAGES.map((stage) => {
              const list = rows.filter((r) => r.stage === stage);
              return (
                <section key={stage} className={`kanban-col${over === stage ? ' over' : ''}`} data-stage={stage} data-testid={`col-${stage}`} aria-label={t(`l.stage.${stage}`)}>
                  <header className="kanban-head" data-stage={stage}><span className={`stage-dot s-${stage}`} />{t(`l.stage.${stage}`)}<span className="badge">{list.length}</span></header>
                  <div className="kanban-list" data-stage={stage}>
                    <AnimatePresence initial={false}>
                      {list.map((l) => (
                        <motion.article key={l.id} layout layoutId={l.id} className="lead-card" data-testid="lead-card"
                          drag dragSnapToOrigin dragElastic={0.6} whileDrag={{ scale: 1.04, rotate: -1.5, zIndex: 20, boxShadow: '0 20px 40px -18px rgb(0 0 0 / 0.45)' }}
                          onDrag={(e) => { const p = e as PointerEvent; setOver(stageAt(p.clientX, p.clientY)); }}
                          onDragEnd={(e) => { const p = e as PointerEvent; const s = stageAt(p.clientX, p.clientY); setOver(null); if (s) void moveTo(l, s); }}
                          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                          <div className="spread"><b className="ellipsis">{l.fullName}</b><span className="badge">{t(`src.${l.source}`)}</span></div>
                          <div className="muted" style={{ fontSize: 12 }}>{l.courseName ?? '—'} · {day(l.createdAt.slice(0, 10))}</div>
                          {l.placementScore !== null && <div className="row" style={{ fontSize: 12 }}><span className="badge badge-data">{l.placementScore}/100</span>{l.level && <span>{t(`lvl.${l.level}`)}</span>}</div>}
                          {l.trialDate && l.stage === 'trial' && <div className="row" style={{ fontSize: 12 }}><Icon name="clock" size={14} />{l.trialGroupName} · {day(l.trialDate)}</div>}
                          {l.stage === 'lost' && l.lostReason && <div className="muted" style={{ fontSize: 12 }}>{l.lostReason}</div>}
                          <div className="lead-actions">
                            {stage === 'new' && <button className="btn btn-sm" onClick={() => setDialog({ kind: 'placement', lead: l })}>{t('l.stage.placement')}</button>}
                            {(stage === 'new' || stage === 'placement') && <button className="btn btn-sm" onClick={() => setDialog({ kind: 'trial', lead: l })}>{t('l.stage.trial')}</button>}
                            {stage === 'trial' && <button className="btn btn-sm btn-primary" onClick={() => setDialog({ kind: 'enroll', lead: l })}>{t('l.enroll')}</button>}
                            {stage === 'lost' && <button className="btn btn-sm" onClick={() => moveTo(l, 'new')}>{t('l.restore')}</button>}
                            {stage !== 'enrolled' && stage !== 'lost' && <button className="btn btn-sm btn-ghost" onClick={() => moveTo(l, 'lost')}>{t('l.markLost')}</button>}
                          </div>
                        </motion.article>
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      )}
      <LeadDialogs dialog={dialog} onClose={() => setDialog(null)} onDone={(msg) => { setDialog(null); if (msg) toast(msg); }} />
    </div>
  );
}
