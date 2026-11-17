/**
 * Bakes the demo database at build time: migrations + the static part of the demo centre in PGlite under Node,
 * dumped to public/demo/snapshot.tar.gz. The browser loads it with `loadDataDir` (no initdb, no migrations)
 * and only adds the date-relative timeline for "today" — so a first visit takes about a second, not minutes.
 *
 *   npx tsx apps/web/scripts/bake-demo.ts      (run by `npm run build:demo`)
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@ustoz/db';
import { createPglite, wrapPglite } from '@ustoz/db/pglite';
import { hasTimeline, isSeeded, seedStaticData, seedTimeline } from '@ustoz/seed';
import { dropTemplateDbs, trimWal } from './trim-wal';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/demo/snapshot.tar.gz');

const t0 = Date.now();
const pg = await createPglite();
const db = wrapPglite(pg);
await migrate(db);
await seedStaticData(db);
await pg.exec('vacuum full');
await pg.exec('checkpoint');
const [pos] = (await pg.query<{ lsn: string; file: string }>('select pg_current_wal_insert_lsn()::text as lsn, pg_walfile_name(pg_current_wal_insert_lsn()) as file')).rows;
const raw = new Uint8Array(await (await pg.dumpDataDir('none')).arrayBuffer());
await pg.close();

/** Opens a candidate snapshot exactly like the browser does and seeds a timeline on it. */
async function verify(gz: Uint8Array): Promise<boolean> {
  try {
    const copy = await createPglite(undefined, { loadDataDir: new Blob([new Uint8Array(gz)], { type: 'application/x-gzip' }) });
    const cdb = wrapPglite(copy);
    const ok = (await isSeeded(cdb)) && !(await hasTimeline(cdb)) && (await seedTimeline(cdb)).invoices > 0;
    await copy.close();
    return ok;
  } catch (e) {
    console.warn('snapshot verify failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

const trimmed = trimWal(raw, pos!.file, pos!.lsn);
const slim = dropTemplateDbs(trimmed.tar);
let gz = gzipSync(slim.tar, { level: 9 });
if (!(await verify(gz))) {
  console.warn('snapshot without template databases did not open, keeping them');
  gz = gzipSync(trimmed.tar, { level: 9 });
}
if (!(await verify(gz))) {
  console.warn('trimmed snapshot did not open, shipping the full dump');
  gz = gzipSync(raw, { level: 9 });
  if (!(await verify(gz))) throw new Error('demo snapshot does not open');
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gz);
console.log(`demo snapshot → public/demo/snapshot.tar.gz (${Math.round(statSync(out).size / 1024)} KB, WAL segments dropped: ${trimmed.dropped.length}, template files dropped: ${slim.dropped}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(0);
