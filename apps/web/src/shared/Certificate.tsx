/** A printable certificate with a QR code that opens the public verification page. */
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { useT } from '../i18n';

export function Qr({ text, size = 112 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export interface CertData {
  code: string;
  studentName: string;
  courseName: string;
  level: string;
  issuedOn: string;
  centreName: string;
  url: string;
}

export function Certificate({ c }: { c: CertData }) {
  const { t, day } = useT();
  return (
    <div className="cert printable" data-testid="certificate">
      <div className="cert-border">
        <div className="cert-top">
          <span className="brand"><span className="brand-mark">U</span>{c.centreName}</span>
          <span className="cert-code num">{t('cert.code')}: {c.code}</span>
        </div>
        <div className="cert-title">{t('cert.heading')}</div>
        <div className="cert-name">{c.studentName}</div>
        <div className="cert-line">{t('cert.line')}</div>
        <div className="cert-course">{c.courseName}</div>
        <div className="cert-foot">
          <div>
            <div className="cert-meta"><span>{t('cert.level')}</span><b>{c.level}</b></div>
            <div className="cert-meta"><span>{t('cert.issued')}</span><b>{day(c.issuedOn)} {c.issuedOn.slice(0, 4)}</b></div>
          </div>
          <div className="cert-qr">
            <Qr text={c.url} size={96} />
            <small>{t('cert.scan')}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
