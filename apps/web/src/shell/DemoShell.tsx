/**
 * The demo page: top bar (brand, "Demo mode" badge, role switcher, language, reset), the web panel for staff
 * roles and a phone with the Telegram Mini App + bot chat. Students and parents get the phone centre stage.
 */
import { LayoutGroup, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Role } from '@ustoz/core';
import { RoleProvider, useApi, useStatus } from '../api/context';
import { useT, type Locale } from '../i18n';
import { Icon } from '../ui/icons';
import { Loading, Seg, useToast } from '../ui/kit';
import { PAGES, pagesFor, type PageKey } from '../admin/pages';
import { TelegramPane } from './TelegramPane';
import { useIsPhone } from './Phone';

const AdminPage = lazy(() => import('../admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const ROLES: Role[] = ['director', 'admin', 'teacher', 'student', 'parent'];

export function useHash(): string {
  const [h, setH] = useState(() => location.hash.replace(/^#/, ''));
  useEffect(() => {
    const fn = () => setH(location.hash.replace(/^#/, ''));
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return h;
}

function readRole(): Role {
  try {
    const r = sessionStorage.getItem('ustoz.role') as Role | null;
    if (r && ROLES.includes(r)) return r;
  } catch {
    /* ignore */
  }
  return 'director';
}

export function DemoShell() {
  const { t, l, setL } = useT();
  const api = useApi();
  const status = useStatus();
  const toast = useToast();
  const hash = useHash();
  const isPhone = useIsPhone();
  const [role, setRoleState] = useState<Role>(readRole);
  const [mobileTab, setMobileTab] = useState<'panel' | 'phone'>('panel');
  const [showPhone, setShowPhone] = useState(false);
  const staff = role === 'director' || role === 'admin' || role === 'teacher';
  const allowed = pagesFor(role);
  const page = (hash.startsWith('/p/') ? hash.slice(3) : '') as PageKey;
  const current: PageKey = allowed.includes(page) ? page : allowed[0]!;

  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      sessionStorage.setItem('ustoz.role', r);
    } catch {
      /* ignore */
    }
    const first = pagesFor(r)[0];
    if (first) location.hash = `/p/${first}`;
  };

  useEffect(() => {
    if (status.phase === 'ready' && status.bootMs) console.info(`[ustoz] in-browser backend ready in ${status.bootMs} ms`);
  }, [status.phase, status.bootMs]);

  const reset = async () => {
    await api.reset?.();
    toast(t('c.saved'));
  };

  return (
    <RoleProvider role={role} setRole={setRole}>
      <div className="app">
        <header className="topbar">
          <a className="brand" href="#/" aria-label="Ustoz"><span className="brand-mark">U</span>Ustoz</a>
          <span className="demo-badge" data-testid="demo-badge" title={status.bootMs ? t('demo.ready', { ms: status.bootMs }) : undefined}>
            <span className="dot" aria-hidden="true" />
            <span>{t('demo.badge')}</span>
          </span>
          <div className="topbar-right">
            <div className="role-switch" data-testid="role-switch">
              <Seg label={t('demo.viewAs')} value={role} onChange={setRole} options={ROLES.map((r) => ({ v: r, label: t(`role.${r}`), short: t(`role.short.${r}`) }))} />
            </div>
            <select className="lang-select" aria-label="Language" value={l} onChange={(e) => setL(e.target.value as Locale)}>
              <option value="uz">UZ</option>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
            <button className="btn btn-sm btn-ghost" onClick={reset} title={t('demo.reset')} aria-label={t('demo.reset')}><Icon name="refresh" /></button>
          </div>
        </header>

        {staff ? (
          <div className={`desk${showPhone ? ' show-phone' : ''}`}>
            {!isPhone && (
              <nav className="sidenav" aria-label="Sections">
                <LayoutGroup id="nav">
                  {allowed.map((k) => (
                    <a key={k} href={`#/p/${k}`} className={k === current ? 'on' : ''} aria-current={k === current ? 'page' : undefined}>
                      {k === current && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <Icon name={PAGES[k].icon} />
                      {t(PAGES[k].label)}
                    </a>
                  ))}
                </LayoutGroup>
                <div className="sidenav-foot">{t('demo.phoneHint')}</div>
              </nav>
            )}
            {(!isPhone || mobileTab === 'panel') && (
              <main className="content">
                {isPhone && (
                  <nav className="mobile-nav" aria-label="Sections">
                    {allowed.map((k) => <a key={k} href={`#/p/${k}`} className={k === current ? 'on' : ''}><Icon name={PAGES[k].icon} size={15} />{t(PAGES[k].label)}</a>)}
                  </nav>
                )}
                <Suspense fallback={<Loading />}>
                  <AdminPage page={current} />
                </Suspense>
                {!isPhone && (
                  <button className="btn btn-accent phone-toggle" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 55 }} onClick={() => setShowPhone((s) => !s)}>
                    <Icon name={showPhone ? 'close' : 'phone'} />{t('tab.phone')}
                  </button>
                )}
              </main>
            )}
            {(!isPhone || mobileTab === 'phone') && <TelegramPane staffRole={role} />}
            {isPhone && (
              <div className="mobile-tabs">
                <button className={`btn ${mobileTab === 'panel' ? 'btn-primary' : ''}`} onClick={() => setMobileTab('panel')}><Icon name="dashboard" />{t('tab.panel')}</button>
                <button className={`btn ${mobileTab === 'phone' ? 'btn-primary' : ''}`} onClick={() => setMobileTab('phone')}><Icon name="phone" />{t('tab.phone')}</button>
              </div>
            )}
          </div>
        ) : (
          <div className="desk family">
            <div className="family-side">
              <span className="badge badge-accent" style={{ justifySelf: 'start' }}>{t(`role.${role}`)}</span>
              <h1>{t('mini.hello', { name: role === 'student' ? 'Aziz' : 'Shoira' })}</h1>
              <p className="muted">{t('demo.familyHint')}</p>
            </div>
            <TelegramPane staffRole={role} />
            <div className="family-right" />
          </div>
        )}
      </div>
    </RoleProvider>
  );
}
