import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb, migrate } from '../src/db/db.js';
import { upsertVocabWithResult, recordReview, getReviewQueue, graduateVocabWords, getGraduatedVocab } from '../src/db/dal.js';

let db: Database.Database;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
});

function seedVocab(d: Database.Database, word: string) {
  return upsertVocabWithResult(d, 'local', { word, normalized: word.toLowerCase(), kind: 'word', timesSuggested: 0, timesUsed: 0 });
}

describe('recordReview — SM-2', () => {
  it('first easy: reps=1, interval=1, ease increases, next_review_at set', () => {
    const { id } = seedVocab(db, 'leverage');
    recordReview(db, 'local', id, 'easy');
    const row = db.prepare('SELECT sm2_interval, sm2_reps, sm2_ease, next_review_at FROM vocab WHERE id = ?').get(id) as any;
    expect(row.sm2_reps).toBe(1);
    expect(row.sm2_interval).toBe(1);
    expect(row.sm2_ease).toBeGreaterThan(2.5);
    expect(row.next_review_at).toBeTruthy();
  });

  it('second easy: reps=2, interval=6', () => {
    const { id } = seedVocab(db, 'leverage');
    recordReview(db, 'local', id, 'easy');
    recordReview(db, 'local', id, 'easy');
    const row = db.prepare('SELECT sm2_interval, sm2_reps FROM vocab WHERE id = ?').get(id) as any;
    expect(row.sm2_reps).toBe(2);
    expect(row.sm2_interval).toBe(6);
  });

  it('third consecutive easy: interval grows beyond 6', () => {
    const { id } = seedVocab(db, 'leverage');
    recordReview(db, 'local', id, 'easy');
    recordReview(db, 'local', id, 'easy');
    recordReview(db, 'local', id, 'easy');
    const row = db.prepare('SELECT sm2_interval, sm2_reps FROM vocab WHERE id = ?').get(id) as any;
    expect(row.sm2_reps).toBe(3);
    expect(row.sm2_interval).toBeGreaterThan(6);
  });

  it('hard review: interval=1, reps reset to 0', () => {
    const { id } = seedVocab(db, 'leverage');
    recordReview(db, 'local', id, 'hard');
    const row = db.prepare('SELECT sm2_interval, sm2_reps FROM vocab WHERE id = ?').get(id) as any;
    expect(row.sm2_interval).toBe(1);
    expect(row.sm2_reps).toBe(0);
  });
});

describe('getReviewQueue — SM-2 schedule', () => {
  it('includes new words (next_review_at IS NULL)', () => {
    const { id } = seedVocab(db, 'moat');
    const queue = getReviewQueue(db, 'local', 10);
    expect(queue.map(v => v.id)).toContain(id);
  });

  it('excludes words scheduled for the future', () => {
    const { id } = seedVocab(db, 'runway');
    db.prepare("UPDATE vocab SET next_review_at = date('now', '+30 days') WHERE id = ?").run(id);
    expect(getReviewQueue(db, 'local', 10).map(v => v.id)).not.toContain(id);
  });

  it('excludes graduated words', () => {
    const { id } = seedVocab(db, 'moat');
    db.prepare('UPDATE vocab SET graduated = 1 WHERE id = ?').run(id);
    expect(getReviewQueue(db, 'local', 10).map(v => v.id)).not.toContain(id);
  });
});

describe('graduateVocabWords', () => {
  it('marks matching normalized words as graduated', () => {
    seedVocab(db, 'leverage');
    seedVocab(db, 'moat');
    graduateVocabWords(db, 'local', ['leverage', 'moat']);
    const rows = db.prepare("SELECT word, graduated FROM vocab WHERE user_id = 'local'").all() as any[];
    expect(rows.find((r: any) => r.word === 'leverage')?.graduated).toBe(1);
    expect(rows.find((r: any) => r.word === 'moat')?.graduated).toBe(1);
  });

  it('does not throw for words not in vocab', () => {
    expect(() => graduateVocabWords(db, 'local', ['nonexistent'])).not.toThrow();
  });

  it('does not overwrite already-graduated timestamp', () => {
    seedVocab(db, 'leverage');
    db.prepare("UPDATE vocab SET graduated = 1, graduated_at = '2026-01-01' WHERE user_id = 'local' AND normalized = 'leverage'").run();
    graduateVocabWords(db, 'local', ['leverage']);
    const row = db.prepare("SELECT graduated_at FROM vocab WHERE normalized = 'leverage'").get() as any;
    expect(row.graduated_at).toBe('2026-01-01');
  });
});

describe('getGraduatedVocab', () => {
  it('returns only graduated words', () => {
    seedVocab(db, 'leverage');
    const { id } = seedVocab(db, 'moat');
    db.prepare("UPDATE vocab SET graduated = 1, graduated_at = datetime('now') WHERE id = ?").run(id);
    const result = getGraduatedVocab(db, 'local');
    expect(result.map(v => v.word)).toEqual(['moat']);
  });

  it('returns empty array when none graduated', () => {
    seedVocab(db, 'leverage');
    expect(getGraduatedVocab(db, 'local')).toHaveLength(0);
  });
});
