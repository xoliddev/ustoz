/** Public certificate check (#/verify/CODE): no sign-in, recomputes the HMAC signature server-side. */
import { motion } from 'motion/react';
import { useData } from '../api/context';
import { useT } from '../i18n';
import { Icon } from '../ui/icons';
import { Loading } from '../ui/kit';
import { Certificate } from '../shared/Certificate';

export function Verify({ code }: { code: string }) {
  const { t } = useT();
  const valid = /^[A-Za-z0-9]{6,12}$/.test(code);
  const r = useData('director', 'certificates.verify', valid ? { code } : null);
  return (
    <div className="verify">
      <a className="brand" href="#/"><span className="brand-mark">U</span>Ustoz</a>
      <h1>{t('cert.verifyTitle')}</h1>
      {valid && !r.data && !r.error ? <Loading rows={3} /> : r.data?.valid ? (
        <motion.div className="stack" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="notice notice-ok" data-testid="verify-ok"><Icon name="shield" />{t('cert.valid')}</div>
          <Certificate c={{ ...r.data.certificate, url: location.href }} />
        </motion.div>
      ) : (
        <div className="notice notice-bad" data-testid="verify-bad"><Icon name="alert" />{t('cert.invalid')}</div>
      )}
    </div>
  );
}
