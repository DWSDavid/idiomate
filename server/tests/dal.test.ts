import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import {
  getPrimeCandidates,
  getVocabSample,
  incrementVocabUsed,
  insertVocab,
  recordErrors,
  getTallies,
  upsertVocab,
} from '../src/db/dal.js';

let db: ReturnType<typeof openDb>;
beforeEach(() => { db = openDb(':memory:'); migrate(db); });

it('inserts and samples vocab', () => {
  insertVocab(db, [{ word: 'leverage', defCn: '利用', timesSuggested: 0, timesUsed: 0 }]);
  expect(getVocabSample(db, 5).length).toBe(1);
});

it('upserts vocab by normalized text and accumulates capture count', () => {
  insertVocab(db, [
    { word: ' Risk   premium ', kind: 'phrase', defCn: 'risk return spread', timesSuggested: 0, timesUsed: 0 },
    { word: 'risk premium', defCn: 'duplicate capture', timesSuggested: 0, timesUsed: 0 },
  ]);

  const vocab = getPrimeCandidates(db, 10);
  expect(vocab).toHaveLength(1);
  expect(vocab[0].normalized).toBe('risk premium');
  expect(vocab[0].captureCount).toBe(2);
});

it('selects prime candidates by deterministic weighted priority', () => {
  upsertVocab(db, {
    word: 'plain',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2026-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'risk premium',
    kind: 'phrase',
    captureCount: 3,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'overused',
    kind: 'word',
    captureCount: 9,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 12,
  });

  expect(getPrimeCandidates(db, 2).map(v => v.word)).toEqual(['risk premium', 'plain']);
});

it('increments vocab usage by normalized word', () => {
  upsertVocab(db, { word: 'Leverage', timesSuggested: 0, timesUsed: 0 });
  incrementVocabUsed(db, ' leverage ');

  expect(getPrimeCandidates(db, 1)[0].timesUsed).toBe(1);
});

it('tallies error types across calls', () => {
  recordErrors(db, ['redundancy', 'calque', 'redundancy']);
  const t = getTallies(db);
  expect(t.find(x => x.errorType === 'redundancy')!.count).toBe(2);
});
