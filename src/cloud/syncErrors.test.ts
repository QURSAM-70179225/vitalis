import { describe, expect, it } from 'vitest';
import { explainSyncError, syncItemName } from './syncErrors';

describe('sync error advice', () => {
  it('explains common errors in plain words', () => {
    expect(explainSyncError('TypeError: Failed to fetch')!.title).toMatch(/reach the server/);
    expect(explainSyncError('check_ins: new row violates row-level security policy for table "check_ins"')!.fix).toMatch(/schema\.sql/);
    expect(explainSyncError('journal_entries: column "answers" does not exist')!.fix).toMatch(/schema\.sql/);
    expect(explainSyncError('JWT expired')!.fix).toMatch(/Sign out/);
    expect(explainSyncError('something odd')!.fix).toMatch(/Try again/);
    expect(explainSyncError(null)).toBeNull();
  });
  it('names waiting items in plain words', () => {
    expect(syncItemName('check_ins')).toBe('Daily check-in');
    expect(syncItemName('unknown')).toBe('unknown');
  });
});
