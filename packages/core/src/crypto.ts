/**
 * Crypto helpers on WebCrypto, so the exact same code runs in Node 22+, the browser and the demo's Web Worker.
 * MD5 is included only because Click's merchant API signs requests with it (never used for anything else).
 */
const enc = new TextEncoder();

type Key = string | Uint8Array;
const bytes = (k: Key): Uint8Array => (typeof k === 'string' ? enc.encode(k) : k);
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export async function hmacSha256(key: Key, msg: Key): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', buf(bytes(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(bytes(msg))));
}

export async function sha256Hex(msg: Key): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', buf(bytes(msg)))));
}

export const toHex = (u: Uint8Array): string => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');

/** Constant-time string comparison (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(nBytes = 16): string {
  return toHex(crypto.getRandomValues(new Uint8Array(nBytes)));
}

export function base64(s: string): string {
  const b = enc.encode(s);
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin);
}

export function fromBase64(s: string): string {
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ── MD5 (RFC 1321), for Click's sign_string only ─────────────────────────────
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Hex(input: string): string {
  const msg = enc.encode(input);
  const len = msg.length;
  const total = (((len + 8) >>> 6) + 1) * 64;
  const m = new Uint8Array(total);
  m.set(msg);
  m[len] = 0x80;
  const bitLen = len * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, bitLen >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bitLen / 2 ** 32), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + dv.getUint32(off + g * 4, true)) >>> 0;
      A = D; D = C; C = B;
      const s = S[(i >>> 4) * 4 + (i % 4)]!;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
  return toHex(new Uint8Array(out.buffer));
}
