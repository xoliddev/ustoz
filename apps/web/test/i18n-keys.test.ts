/** Every literal t('key') used in the web UI exists in the dictionary (in all three languages). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEB } from '@ustoz/i18n';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('web copy', () => {
  it('has no missing keys', () => {
    const missing: string[] = [];
    for (const f of files(join(__dirname, '../src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z][\w.]*)'/g)) if (!WEB[m[1]!]) missing.push(`${m[1]} (${f.split(String.fromCharCode(92)).join('/').split('/src/')[1]})`);
      // dynamic keys built from known prefixes: role.*, nav.*, l.stage.*, src.*, lvl.*, m.*, a.*, p.scheme.*, disc.*, reason.*, c.*
      for (const m of src.matchAll(/\bt\(`([a-zA-Z][\w.]*)\$\{/g)) {
        const prefix = m[1]!;
        expect(Object.keys(WEB).some((k) => k.startsWith(prefix)), `prefix ${prefix} in ${f}`).toBe(true);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every enum value the UI formats has copy', () => {
    for (const k of ['present', 'late', 'absent', 'excused']) expect(WEB[`a.${k}`]).toBeTruthy();
    for (const k of ['cash', 'card', 'transfer', 'payme', 'click', 'uzum']) expect(WEB[`m.${k}`]).toBeTruthy();
    for (const k of ['new', 'placement', 'trial', 'enrolled', 'lost']) expect(WEB[`l.stage.${k}`]).toBeTruthy();
    for (const k of ['instagram', 'telegram', 'referral', 'google', 'walk_in']) expect(WEB[`src.${k}`]).toBeTruthy();
    for (const k of ['fixed', 'per_student', 'percent']) expect(WEB[`p.scheme.${k}`]).toBeTruthy();
    for (const k of ['sibling', 'prepaid', 'custom']) expect(WEB[`disc.${k}`]).toBeTruthy();
    for (const k of ['missed_streak', 'overdue_debt', 'low_attendance']) expect(WEB[`reason.${k}`]).toBeTruthy();
    for (const k of ['paid', 'partial', 'unpaid']) expect(WEB[`c.${k}`]).toBeTruthy();
  });
});
