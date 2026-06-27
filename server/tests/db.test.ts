import { describe, it, expect } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';

describe('migrate', () => {
  it('adds SM-2 and graduation columns to vocab', () => {
    const db = openDb(':memory:');
    migrate(db);
    const cols = db.prepare('PRAGMA table_info(vocab)').all() as Array<{ name: string }>;
    const names = cols.map(c => c.name);
    expect(names).toContain('sm2_interval');
    expect(names).toContain('sm2_ease');
    expect(names).toContain('sm2_reps');
    expect(names).toContain('next_review_at');
    expect(names).toContain('graduated');
    expect(names).toContain('graduated_at');
  });
});
