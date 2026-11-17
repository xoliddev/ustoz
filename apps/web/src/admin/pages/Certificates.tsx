/** Certificates: issue (signed with HMAC, QR to the public check), list, print. */
import { useState } from 'react';
import { useAction, useData, useRole } from '../../api/context';
import { useT } from '../../i18n';
import { Icon } from '../../ui/icons';
import { Empty, ErrorBox, Loading, Modal, useErrorToast, useToast } from '../../ui/kit';
import { Certificate, Qr, type CertData } from '../../shared/Certificate';

export default function Certificates() {
  const { t, day } = useT();
  const { role } = useRole();
  const list = useData(role, 'certificates.list', {});
  const [show, setShow] = useState<CertData | null>(null);
  const [issuing, setIssuing] = useState(false);
  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t('cert.title')}</h1>
        <button className="btn btn-accent" onClick={() => setIssuing(true)}><Icon name="plus" />{t('cert.issue')}</button>
      </div>
      {!list.data ? <Loading /> : !list.data.length ? <div className="card"><Empty /></div> : (
        <div className="cert-grid">
          {list.data.map((c) => (
            <button key={c.id} className="card cert-card" onClick={() => setShow(c)} data-testid="cert-card">
              <Qr text={c.url} size={56} />
              <span className="grow" style={{ textAlign: 'left' }}>
                <b style={{ display: 'block' }}>{c.studentName}</b>
                <span className="muted" style={{ fontSize: 12 }}>{c.courseName} · {c.level} · {day(c.issuedOn)}</span>
              </span>
              <span className="badge num">{c.code}</span>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!show} title={t('cert.title')} onClose={() => setShow(null)}>
        {show && (
          <div className="stack">
            <Certificate c={show} />
            <div className="row">
              <a className="btn grow" href={`#/verify/${show.code}`} target="_blank" rel="noreferrer"><Icon name="shield" />{t('cert.verifyTitle')}</a>
              <button className="btn btn-primary grow" onClick={() => window.print()}><Icon name="print" />{t('c.print')}</button>
            </div>
          </div>
        )}
      </Modal>
      <Issue open={issuing} onClose={() => setIssuing(false)} onIssued={(c) => { setIssuing(false); setShow(c); }} />
    </div>
  );
}

function Issue({ open, onClose, onIssued }: { open: boolean; onClose(): void; onIssued(c: CertData): void }) {
  const { t } = useT();
  const { role } = useRole();
  const students = useData(role, 'students.list', open ? {} : null);
  const st = useData(role, 'org.structure', open ? {} : null);
  const { run, busy } = useAction();
  const toast = useToast();
  const fail = useErrorToast();
  const [f, setF] = useState({ studentId: '', courseId: '', level: 'B1' });
  const sid = f.studentId || students.data?.[0]?.id || '';
  const cid = f.courseId || st.data?.courses[0]?.id || '';
  return (
    <Modal open={open} title={t('cert.issue')} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        try {
          const c = await run(role, 'certificates.issue', { studentId: sid, courseId: cid, level: f.level });
          toast(t('cert.done'));
          onIssued(c);
        } catch (err) {
          fail(err);
        }
      }}>
        <label className="field"><span>{t('nav.students')}</span><select className="select" value={sid} onChange={(e) => setF({ ...f, studentId: e.target.value })}>{students.data?.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>
        <label className="field"><span>{t('c.course')}</span><select className="select" value={cid} onChange={(e) => setF({ ...f, courseId: e.target.value })}>{st.data?.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>{t('cert.level')}</span><input className="input" required value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} /></label>
        <button className="btn btn-primary btn-lg" disabled={busy || !sid || !cid}>{t('cert.issue')}</button>
      </form>
    </Modal>
  );
}
