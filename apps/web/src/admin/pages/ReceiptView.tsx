/** A printable payment receipt. */
import type { Receipt } from '@ustoz/db';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Money } from '../../ui/kit';

export function ReceiptView({ r }: { r: Receipt }) {
  const { t, day } = useT();
  const local = new Date(Date.parse(r.paidAt) + 5 * 3600_000).toISOString();
  return (
    <div className="stack">
      <div className="receipt printable" data-testid="receipt">
        <div className="receipt-head">
          <span className="brand"><span className="brand-mark">U</span>{r.centreName}</span>
          <span className="badge badge-ok"><Icon name="check" size={14} />{t('c.paid')}</span>
        </div>
        <div className="receipt-amount"><Money v={r.amount} /></div>
        <dl className="receipt-lines">
          <dt>{t('b.receiptNo')}</dt><dd className="num">{r.receiptNo}</dd>
          <dt>{t('nav.students')}</dt><dd>{r.studentName}</dd>
          <dt>{t('c.date')}</dt><dd>{day(local.slice(0, 10))}, {local.slice(11, 16)}</dd>
          <dt>{t('c.amount')}</dt><dd><Money v={r.amount} /> · {t(`m.${r.method}`)}</dd>
          <dt>{t('b.balanceAfter')}</dt><dd className={r.balanceAfter < 0 ? 'text-bad' : ''}><Money v={r.balanceAfter} /></dd>
        </dl>
        <div className="receipt-tear" aria-hidden="true" />
      </div>
      <button className="btn" onClick={() => window.print()}><Icon name="print" />{t('c.print')}</button>
    </div>
  );
}
