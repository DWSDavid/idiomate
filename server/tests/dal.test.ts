import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import { insertVocab, getVocabSample, recordErrors, getTallies } from '../src/db/dal.js';

let db: ReturnType<typeof openDb>;
beforeEach(() => { db = openDb(':memory:'); migrate(db); });

it('inserts and samples vocab', () => {
  insertVocab(db, [{ word: 'leverage', defCn: '利用', timesSuggested: 0, timesUsed: 0 }]);
  expect(getVocabSample(db, 5).length).toBe(1);
});

it('tallies error types across calls', () => {
  recordErrors(db, ['redundancy', 'calque', 'redundancy']);
  const t = getTallies(db);
  expect(t.find(x => x.errorType === 'redundancy')!.count).toBe(2);
});
