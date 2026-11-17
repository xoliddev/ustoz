/** Top-level: boot screen until the backend is ready, then the public verify page or the demo shell. */
import { useStatus } from './api/context';
import { useT } from './i18n';
import { DemoShell, useHash } from './shell/DemoShell';
import { Verify } from './verify/Verify';

export function App() {
  const status = useStatus();
  const { t } = useT();
  const hash = useHash();
  if (status.phase !== 'ready') {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="brand"><span className="brand-mark">U</span>Ustoz</span>
        <span className="demo-badge"><span className="dot" />{t('demo.badge')}</span>
        {status.phase === 'error' ? (
          <>
            <p className="text-bad">{t('boot.error')}: {status.error}</p>
            <button className="btn" onClick={() => location.reload()}>{t('boot.retry')}</button>
          </>
        ) : (
          <>
            <div className="boot-bar"><span style={{ transform: `scaleX(${Math.max(0.05, status.progress)})` }} /></div>
            <p className="muted">{t(status.phase === 'seeding' ? 'boot.seeding' : 'boot.loading')}</p>
          </>
        )}
      </div>
    );
  }
  const verify = /^\/verify\/([A-Za-z0-9]+)$/.exec(hash);
  if (verify) return <Verify code={verify[1]!} />;
  return <DemoShell />;
}
