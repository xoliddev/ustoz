/** Online payment sheet: Payme / Click / Uzum in sandbox, with the provider protocol log. */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { ProtocolStep } from '@ustoz/payments';
import { useApi } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Money, useErrorToast } from '../../ui/kit';

const PROVIDERS = [
  { k: 'payme' as const, color: '#00b8c8' },
  { k: 'click' as const, color: '#0a6cff' },
  { k: 'uzum' as const, color: '#7b2ff7' },
];

export function PaySheet({ open, as, studentId, debt, onClose }: { open: boolean; as: 'student' | 'parent'; studentId: string; debt: number; onClose(): void }) {
  const { t } = useT();
  const api = useApi();
  const fail = useErrorToast();
  const [provider, setProvider] = useState<'payme' | 'click' | 'uzum'>('payme');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ProtocolStep[] | null>(null);
  const [showLog, setShowLog] = useState(false);
  const close = () => {
    setSteps(null);
    setShowLog(false);
    onClose();
  };
  const pay = async () => {
    setBusy(true);
    try {
      const co = await api.call(as, 'payments.checkout', { studentId, amount: debt, provider });
      if (api.sandboxPay) setSteps(await api.sandboxPay(provider, co.paymentId, debt));
      else window.open(co.url, '_blank', 'noopener');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div className="sheet" role="dialog" aria-label={t('mini.payTitle')} onClick={(e) => e.stopPropagation()} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
            <span className="sheet-grip" aria-hidden="true" />
            {!steps ? (
              <div className="stack">
                <div className="spread"><h2>{t('mini.payTitle')}</h2><button className="btn btn-ghost icon-btn" onClick={close} aria-label={t('c.close')}><Icon name="close" /></button></div>
                <div className="pay-amount"><Money v={debt} /></div>
                <div className="pay-providers" role="radiogroup">
                  {PROVIDERS.map((p) => (
                    <button key={p.k} role="radio" aria-checked={provider === p.k} className={`pay-provider${provider === p.k ? ' on' : ''}`} style={{ ['--pc' as string]: p.color }} onClick={() => setProvider(p.k)} data-testid={`provider-${p.k}`}>
                      <span className="pay-logo">{t(`m.${p.k}`)}</span>
                      {provider === p.k && <motion.span layoutId="pay-check" className="pay-check"><Icon name="check" size={14} /></motion.span>}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12 }}><Icon name="shield" size={13} /> {t('mini.payHint')}</p>
                <button className="btn btn-accent btn-lg btn-block" disabled={busy} onClick={pay} data-testid="pay-confirm">{busy ? t('c.loading') : `${t('mini.pay')} · ${t(`m.${provider}`)}`}</button>
              </div>
            ) : (
              <div className="stack pay-done" data-testid="pay-done">
                <motion.div className="pay-ok" initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1] }} transition={{ duration: 0.5 }}><Icon name="check" size={34} /></motion.div>
                <h2 style={{ textAlign: 'center' }}>{t('mini.paid')}</h2>
                <div className="pay-amount"><Money v={debt} /></div>
                <button className="btn btn-sm btn-ghost" onClick={() => setShowLog((s) => !s)}><Icon name="shield" size={14} />{t('mini.protocol')} ({steps.length})</button>
                {showLog && (
                  <div className="proto">
                    {steps.map((s, i) => (
                      <details key={i} open={i === steps.length - 1}>
                        <summary><span className={`badge ${s.ok ? 'badge-ok' : 'badge-bad'}`}>{i + 1}</span> {stepName(s)}</summary>
                        <pre>{JSON.stringify(s.request, null, 1)}</pre>
                        <pre className="resp">{JSON.stringify(s.response, null, 1)}</pre>
                      </details>
                    ))}
                  </div>
                )}
                <button className="btn btn-primary btn-lg btn-block" onClick={close}>{t('c.close')}</button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function stepName(s: ProtocolStep): string {
  const r = s.request as Record<string, unknown>;
  if (s.provider === 'payme') return String(r.method);
  if (s.provider === 'click') return r.action === '0' ? 'Prepare' : 'Complete';
  return `/${String(r.op)}`;
}
