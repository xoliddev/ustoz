/** The phone column: whose Telegram it is, and inside it the Mini App or the bot chat. */
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Role } from '@ustoz/core';
import { useApi } from '../api/context';
import { useT } from '../i18n';
import { Loading, Seg } from '../ui/kit';
import { Phone } from './Phone';

const MiniApp = lazy(() => import('../mini/MiniApp').then((m) => ({ default: m.MiniApp })));
const BotChat = lazy(() => import('../bot/BotChat').then((m) => ({ default: m.BotChat })));

export function TelegramPane({ staffRole }: { staffRole: Role }) {
  const { t } = useT();
  const api = useApi();
  const manager = staffRole === 'director' || staffRole === 'admin';
  const [persona, setPersona] = useState<Role>(manager ? 'parent' : staffRole);
  const [tab, setTab] = useState<'app' | 'bot'>(manager ? 'bot' : 'app');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setPersona(manager ? 'parent' : staffRole);
    setTab(manager || staffRole === 'parent' ? 'bot' : 'app');
  }, [staffRole, manager]);
  useEffect(() => api.onEvent((e) => e.type === 'outbox' && tab !== 'bot' && setUnread((n) => n + 1)), [api, tab]);
  useEffect(() => {
    if (tab === 'bot') setUnread(0);
  }, [tab]);

  return (
    <aside className="phone-col" aria-label={t('tab.phone')}>
      <div className="phone-col-head">
        {manager && (
          <div className="row">
            <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{t('bot.persona')}:</span>
            <Seg value={persona} onChange={setPersona} options={(['parent', 'student'] as Role[]).map((r) => ({ v: r, label: t(`role.${r}`) }))} />
          </div>
        )}
      </div>
      <Phone label={`Telegram — ${t(`role.${persona}`)}`}>
        <div className="tg-top">
          <div className="tg-tabs" role="tablist">
            {(['app', 'bot'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-testid={`tg-tab-${k}`}>
                {tab === k && <motion.span layoutId={`tg-tab-${staffRole}`} className="tg-tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span>{t(k === 'app' ? 'tab.app' : 'tab.bot')}</span>
                {k === 'bot' && unread > 0 && <span className="tg-unread">{unread}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="tg-body">
          <Suspense fallback={<div style={{ padding: 16 }}><Loading /></div>}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${tab}-${persona}`} className="tg-view" initial={{ opacity: 0, x: tab === 'bot' ? 18 : -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'app' ? <MiniApp persona={persona} /> : <BotChat persona={persona} />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </Phone>
      {manager && <p className="phone-hint">{t('demo.phoneHint')}</p>}
    </aside>
  );
}
