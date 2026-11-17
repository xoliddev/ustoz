import { describe, expect, it } from 'vitest';
import { LocalTestGenerator } from '@ustoz/core';
import { createBackend } from '@ustoz/db';
import { ApiError, ROUTES, validate } from '../src';

describe('contract', () => {
  it('covers exactly the backend methods', () => {
    const be = createBackend({ db: {} as never, clock: { now: () => new Date() }, certSecret: 'x', verifyBase: 'x', testGenerator: new LocalTestGenerator() });
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(be.methods).sort());
  });

  it('only the certificate check is public', () => {
    expect(Object.entries(ROUTES).filter(([, d]) => d.auth === 'public').map(([k]) => k)).toEqual(['certificates.verify']);
  });

  it('rejects malformed input with the field name', () => {
    expect(() => validate('payments.record', { studentId: 'nope', amount: 10, method: 'cash' })).toThrow(ApiError);
    try {
      validate('payments.record', { studentId: '0195f0a0-0000-7000-8000-000000000000', amount: 1.5, method: 'cash' });
    } catch (e) {
      expect((e as ApiError).details.field).toBe('amount');
    }
    expect(() => validate('attendance.mark', { groupId: '0195f0a0-0000-7000-8000-000000000000', date: '2026-02-30', marks: [] })).toThrow(/date/i);
    expect(() => validate('me', { extra: 1 })).toThrow(ApiError);
    expect(() => validate('billing.run', { month: '2026-13' })).toThrow(ApiError);
  });

  it('accepts valid input and strips unknown keys on objects', () => {
    const v = validate('leads.create', { fullName: ' Ali Valiyev ', phone: '90 123 45 67', source: 'instagram', junk: true } as never);
    expect(v).toEqual({ fullName: 'Ali Valiyev', phone: '90 123 45 67', source: 'instagram' });
  });
});
