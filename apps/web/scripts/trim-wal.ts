/**
 * Shrinks a PGlite data-dir tarball (ustar, uncompressed) before it ships with the demo.
 *
 * More than half of a gzipped dump is WAL: 16 MB segments full of seeding history that recovery never reads.
 * After `dumpDataDir` the cluster is shut down cleanly with its checkpoint record at the insert position we
 * measured just before the dump, so only that segment is needed, and only up to the page after that record.
 * We drop the other segments and zero the rest of the live one (zeros read as "end of WAL"). The caller must
 * verify the result by opening it, and fall back to the untrimmed dump if that fails.
 */
const BLOCK = 512;
const WAL_SEG = 16 * 1024 * 1024;
const PAGE = 8192;

const readStr = (b: Uint8Array, off: number, len: number) => {
  let end = off;
  while (end < off + len && b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(off, end));
};
const readOctal = (b: Uint8Array, off: number, len: number) => parseInt(readStr(b, off, len).trim() || '0', 8);

/** `lsn` like "0/1D2F720"; `walFile` like "000000010000000000000001". */
export function trimWal(tar: Uint8Array, walFile: string, lsn: string): { tar: Uint8Array; dropped: string[] } {
  const [hi, lo] = lsn.split('/').map((x) => parseInt(x, 16)) as [number, number];
  const offsetInSeg = (hi * 2 ** 32 + lo) % WAL_SEG;
  // keep the page holding the checkpoint record plus one more in case the record crosses a page boundary
  const keepUpTo = Math.min(WAL_SEG, (Math.floor(offsetInSeg / PAGE) + 2) * PAGE);
  const parts: Uint8Array[] = [];
  const dropped: string[] = [];
  let off = 0;
  while (off + BLOCK <= tar.length) {
    const header = tar.subarray(off, off + BLOCK);
    if (header.every((x) => x === 0)) break;
    const name = readStr(header, 345, 155) ? `${readStr(header, 345, 155)}/${readStr(header, 0, 100)}` : readStr(header, 0, 100);
    const size = readOctal(header, 124, 12);
    const span = BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    const entry = tar.slice(off, off + span);
    off += span;
    const m = /pg_wal\/([0-9A-F]{24})$/.exec(name);
    if (m && m[1] !== walFile) {
      dropped.push(name);
      continue;
    }
    if (m && size === WAL_SEG) entry.fill(0, BLOCK + keepUpTo, BLOCK + WAL_SEG);
    parts.push(entry);
  }
  parts.push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return { tar: out, dropped };
}
