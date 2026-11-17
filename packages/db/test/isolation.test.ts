/** Row-level security: a second centre's data is invisible and unwritable from the first centre's scope. */
import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@ustoz/core';
import { CENTRE_ID } from '@ustoz/seed';
import { inScope } from '../src';
import { ADAPTERS, seeded } from './harness';

const TENANT_TABLES = [
  'branches', 'rooms', 'teachers', 'courses', 'groups', 'students', 'parents', 'student_parents', 'enrollments', 'attendance', 'prepaid_plans', 'invoices',
  'payments', 'payment_txns', 'leads', 'lead_events', 'homework', 'submissions', 'tests', 'test_attempts', 'certificates', 'outbox', 'bot_state', 'audit_log',
];

describe.each(ADAPTERS)('tenant isolation ($name)', ({ make }) => {
  it('RLS is enabled on every tenant table', async () => {
    const s = await seeded(make);
    const rows = await s.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`);
    const off = rows.filter((r) => TENANT_TABLES.includes(r.relname) && !r.relrowsecurity).map((r) => r.relname);
    expect(off).toEqual([]);
    expect(rows.filter((r) => TENANT_TABLES.includes(r.relname))).toHaveLength(TENANT_TABLES.length);

    // a second centre with one student
    const other = uuidv7();
    await s.db.query(`insert into centres (id, slug, name) values ($1, 'other', 'Other')`, [other]);
    await s.db.query(`insert into students (centre_id, id, full_name) values ($1, $2, 'Secret Student')`, [other, uuidv7()]);

    // in the demo centre's scope the other centre's rows do not exist
    const seen = await inScope(s.db, { centreId: CENTRE_ID, userId: null }, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from students where full_name = 'Secret Student'`));
    expect(seen[0]!.n).toBe(0);
    for (const t of TENANT_TABLES) {
      const [r] = await inScope(s.db, { centreId: CENTRE_ID, userId: null }, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from ${t} where centre_id <> $1`, [CENTRE_ID]));
      expect(r!.n, t).toBe(0);
    }
    // without a centre in scope nothing is visible at all
    const none = await inScope(s.db, { centreId: null, userId: null }, (tx) => tx.query<{ n: number }>('select count(*)::int as n from students'));
    expect(none[0]!.n).toBe(0);
    // writing into another centre is refused by the policy's WITH CHECK
    await expect(inScope(s.db, { centreId: CENTRE_ID, userId: null }, (tx) => tx.query(`insert into students (centre_id, id, full_name) values ($1, $2, 'x')`, [other, uuidv7()]))).rejects.toThrow(/row-level security/);
    // updates cannot reach the other centre either
    const upd = await inScope(s.db, { centreId: CENTRE_ID, userId: null }, (tx) => tx.query(`update students set full_name = 'pwned' where centre_id = $1 returning id`, [other]));
    expect(upd).toEqual([]);
    // the audit log is append-only for the application role
    await expect(inScope(s.db, { centreId: CENTRE_ID, userId: null }, (tx) => tx.query('delete from audit_log'))).rejects.toThrow(/permission denied/);
    await s.close();
  });

  it('a member of one centre cannot act in another by claiming its id', async () => {
    const s = await seeded(make);
    const other = uuidv7();
    await s.db.query(`insert into centres (id, slug, name) values ($1, 'other2', 'Other 2')`, [other]);
    await expect(s.m['students.list']({ ...s.as.admin, centreId: other }, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.m['students.list']({ ...s.as.teacher, role: 'director' }, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await s.close();
  });
});
