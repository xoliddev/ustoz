/** Receipts and certificates: human-friendly numbers plus an HMAC so a printed copy cannot be forged. */
import { hmacSha256, timingSafeEqual, toHex } from './crypto';

export interface CertificateFields {
  code: string;
  studentName: string;
  courseName: string;
  level: string;
  issuedOn: string;
  centreName: string;
}

const canonical = (f: CertificateFields) => [f.code, f.studentName, f.courseName, f.level, f.issuedOn, f.centreName].join('\n');

/** 16-hex signature over the certificate's printed fields. */
export async function signCertificate(secret: string, f: CertificateFields): Promise<string> {
  return toHex(await hmacSha256(secret, canonical(f))).slice(0, 16);
}

export async function verifyCertificate(secret: string, f: CertificateFields, signature: string): Promise<boolean> {
  return timingSafeEqual(await signCertificate(secret, f), signature);
}

/** "R-2611-000123": receipt number from the month and a per-centre sequence. */
export function receiptNumber(isoDate: string, seq: number): string {
  return `R-${isoDate.slice(2, 4)}${isoDate.slice(5, 7)}-${String(seq).padStart(6, '0')}`;
}

/** Uzbek phone numbers normalized to +998XXXXXXXXX, or null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  const local = d.length === 9 ? d : d.length === 12 && d.startsWith('998') ? d.slice(3) : null;
  return local && /^(33|50|55|77|88|90|91|93|94|95|97|98|99|20|71)\d{7}$/.test(local) ? `+998${local}` : null;
}

export function maskPhone(p: string): string {
  return p.length >= 13 ? `${p.slice(0, 6)} ** *** ${p.slice(-4, -2)} ${p.slice(-2)}` : p;
}
