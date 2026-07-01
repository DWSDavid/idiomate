import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import { getAllVocab, upsertVocab } from '../src/db/dal.js';

type Db = ReturnType<typeof openDb>;

const USER_ID = 'test-browse-user';

function makeDb(): Db {
  const db = openDb(':memory:');
  migrate(db);
  // Ensure user row exists for foreign key / trigger safety
  db.prepare(`
    INSERT INTO users (id, name)
    VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(USER_ID, 'Test User');
  return db;
}

/**
 * Insert a word with an explicit date_added so we can test ordering.
 * upsertVocab uses COALESCE(@lastCaptured, datetime('now')) for last_captured
 * but does NOT let us set date_added directly. We patch it via a direct UPDATE.
 */
function seedWord(db: Db, word: string, dateAdded: string, source = 'capture') {
  const id = upsertVocab(db, USER_ID, {
    word,
    normalized: word.toLowerCase(),
    kind: 'word',
    source,
    timesSuggested: 0,
    timesUsed: 0,
  });
  db.prepare('UPDATE vocab SET date_added = ? WHERE id = ?').run(dateAdded, id);
  return id;
}

describe('getAllVocab', () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  it('returns all non-graduated words with total count', () => {
    seedWord(db, 'alpha', '2026-01-01');
    seedWord(db, 'bravo', '2026-01-02');
    seedWord(db, 'charlie', '2026-01-03');

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 50, sort: 'date' });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('sorts by date added descending when sort=date', () => {
    seedWord(db, 'alpha', '2026-01-01');
    seedWord(db, 'bravo', '2026-01-02');
    seedWord(db, 'charlie', '2026-01-03');

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 50, sort: 'date' });
    expect(result.items.map(item => item.word)).toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('paginates correctly: offset 0 limit 2 returns first two newest', () => {
    seedWord(db, 'alpha', '2026-01-01');
    seedWord(db, 'bravo', '2026-01-02');
    seedWord(db, 'charlie', '2026-01-03');
    seedWord(db, 'delta', '2026-01-04');
    seedWord(db, 'echo', '2026-01-05');

    const page1 = getAllVocab(db, USER_ID, { offset: 0, limit: 2, sort: 'date' });
    expect(page1.total).toBe(5);
    expect(page1.items.map(item => item.word)).toEqual(['echo', 'delta']);

    const page2 = getAllVocab(db, USER_ID, { offset: 2, limit: 2, sort: 'date' });
    expect(page2.total).toBe(5);
    expect(page2.items.map(item => item.word)).toEqual(['charlie', 'bravo']);

    const page3 = getAllVocab(db, USER_ID, { offset: 4, limit: 2, sort: 'date' });
    expect(page3.total).toBe(5);
    expect(page3.items.map(item => item.word)).toEqual(['alpha']);
  });

  it('returns dateAdded and source fields on each item', () => {
    seedWord(db, 'foxtrot', '2026-03-15', 'listen');

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 10, sort: 'date' });
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.dateAdded).toBe('2026-03-15');
    expect(item.source).toBe('listen');
  });

  it('filters by source prefix when source option is provided', () => {
    seedWord(db, 'golf', '2026-01-01', 'capture');
    seedWord(db, 'hotel', '2026-01-02', 'listen');
    seedWord(db, 'india', '2026-01-03', 'listen:Episode 1');

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 50, sort: 'date', source: 'listen' });
    expect(result.total).toBe(2);
    expect(result.items.map(item => item.word)).toContain('hotel');
    expect(result.items.map(item => item.word)).toContain('india');
    expect(result.items.map(item => item.word)).not.toContain('golf');
  });

  it('includes legacy webpage captures in the website source filter', () => {
    upsertVocab(db, USER_ID, {
      word: 'source tagged',
      normalized: 'source tagged',
      kind: 'phrase',
      source: 'website_reading',
      timesSuggested: 0,
      timesUsed: 0,
    });
    upsertVocab(db, USER_ID, {
      word: 'url tagged',
      normalized: 'url tagged',
      kind: 'phrase',
      source: 'capture',
      sourceUrl: 'https://example.com/article',
      timesSuggested: 0,
      timesUsed: 0,
    });
    upsertVocab(db, USER_ID, {
      word: 'context tagged',
      normalized: 'context tagged',
      kind: 'phrase',
      source: 'capture',
      contextSentence: 'From Article: https://example.com/article: context tagged',
      timesSuggested: 0,
      timesUsed: 0,
    });
    upsertVocab(db, USER_ID, {
      word: 'plain capture',
      normalized: 'plain capture',
      kind: 'phrase',
      source: 'capture',
      timesSuggested: 0,
      timesUsed: 0,
    });

    const result = getAllVocab(db, USER_ID, {
      offset: 0,
      limit: 50,
      sort: 'date',
      source: 'website_reading',
    });

    expect(result.total).toBe(3);
    expect(result.items.map(item => item.word)).toEqual(expect.arrayContaining([
      'source tagged',
      'url tagged',
      'context tagged',
    ]));
    expect(result.items.map(item => item.word)).not.toContain('plain capture');
  });

  it('infers website source metadata from captured context on write', () => {
    upsertVocab(db, USER_ID, {
      word: 'enchants',
      normalized: 'enchants',
      kind: 'word',
      contextSentence: 'From Culture desk: https://example.com/culture?utm=secret#section: enchants',
      timesSuggested: 0,
      timesUsed: 0,
    });

    const result = getAllVocab(db, USER_ID, {
      offset: 0,
      limit: 50,
      sort: 'date',
      source: 'website_reading',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      word: 'enchants',
      source: 'website_reading',
      sourceTitle: 'Culture desk',
      sourceUrl: 'https://example.com/culture',
    }));
  });

  it('can include shared extension website captures from another profile', () => {
    upsertVocab(db, 'rubi', {
      word: 'cross-origin capture',
      normalized: 'cross-origin capture',
      kind: 'phrase',
      source: 'website_reading',
      sourceTitle: 'Browser article',
      sourceUrl: 'https://example.com/browser',
      timesSuggested: 0,
      timesUsed: 0,
    });
    seedWord(db, 'local capture', '2026-01-01', 'capture');

    const withoutShared = getAllVocab(db, USER_ID, {
      offset: 0,
      limit: 50,
      sort: 'date',
      source: 'website_reading',
    });
    expect(withoutShared.total).toBe(0);

    const withShared = getAllVocab(db, USER_ID, {
      offset: 0,
      limit: 50,
      sort: 'date',
      source: 'website_reading',
      userIds: ['rubi'],
    });

    expect(withShared.total).toBe(1);
    expect(withShared.items[0]).toEqual(expect.objectContaining({
      word: 'cross-origin capture',
      source: 'website_reading',
      sourceTitle: 'Browser article',
    }));
  });

  it('excludes graduated words', () => {
    const id = seedWord(db, 'juliet', '2026-01-01');
    seedWord(db, 'kilo', '2026-01-02');
    db.prepare('UPDATE vocab SET graduated = 1 WHERE id = ?').run(id);

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 50, sort: 'date' });
    expect(result.total).toBe(1);
    expect(result.items[0].word).toBe('kilo');
  });

  it('sorts by priority when sort=priority', () => {
    // Give 'lima' a high capture count so it ranks higher in priority
    const limaid = upsertVocab(db, USER_ID, {
      word: 'lima', normalized: 'lima', kind: 'word',
      source: 'capture', timesSuggested: 0, timesUsed: 0, captureCount: 10,
    });
    db.prepare('UPDATE vocab SET date_added = ?, capture_count = 10 WHERE id = ?').run('2026-01-01', limaid);

    const miked = upsertVocab(db, USER_ID, {
      word: 'mike', normalized: 'mike', kind: 'word',
      source: 'capture', timesSuggested: 0, timesUsed: 0, captureCount: 1,
    });
    db.prepare('UPDATE vocab SET date_added = ?, capture_count = 1 WHERE id = ?').run('2026-01-02', miked);

    const result = getAllVocab(db, USER_ID, { offset: 0, limit: 50, sort: 'priority' });
    // lima has capture_count=10, mike has 1; priority score should put lima first
    expect(result.items[0].word).toBe('lima');
  });

  it('returns empty items and total=0 for unknown user', () => {
    seedWord(db, 'november', '2026-01-01');
    const result = getAllVocab(db, 'nobody', { offset: 0, limit: 50, sort: 'date' });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
