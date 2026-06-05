import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import {
  getPrimeCandidates,
  getPrimeCandidatePool,
  getVocabSample,
  getMistakeLog,
  getMistakeRanking,
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
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

it('builds a blended prime pool from priority terms and oldest unused terms', () => {
  upsertVocab(db, {
    word: 'top phrase one',
    kind: 'phrase',
    captureCount: 5,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'top phrase two',
    kind: 'phrase',
    captureCount: 4,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'top phrase three',
    kind: 'phrase',
    captureCount: 3,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'old unused',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2025-01-01T00:00:00.000Z',
    timesSuggested: 9,
    timesUsed: 0,
  });
  upsertVocab(db, {
    word: 'old but used',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2024-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 1,
  });

  const pool = getPrimeCandidatePool(db, '', 4).map(v => v.word);

  expect(pool).toEqual(expect.arrayContaining(['top phrase one', 'top phrase two', 'top phrase three']));
  expect(pool).toContain('old unused');
  expect(pool).not.toContain('old but used');
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

it('ranks mistakes with recent examples from saved annotations', () => {
  const olderSession = insertSession(db, { date: '2026-06-01', draftText: 'older draft' });
  const newerSession = insertSession(db, { date: '2026-06-03', draftText: 'newer draft' });
  insertAnnotations(db, olderSession, [
    {
      paragraphIdx: 0,
      span: 'in a state of rapid growth',
      errorType: 'redundancy',
      hint: 'Cut the filler.',
      explanation: 'Redundancy.',
      modelRewrite: 'growing rapidly',
      rule: 'Drop empty category nouns',
      userRewrite: 'growing rapidly',
    },
    {
      paragraphIdx: 0,
      span: 'support to our peer',
      errorType: 'word_choice',
      hint: 'Check the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'support for our peer',
      rule: 'Fixed preposition collocations',
      userRewrite: 'support for our peer',
    },
  ]);
  insertAnnotations(db, newerSession, [
    {
      paragraphIdx: 1,
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
      rule: 'Drop empty category nouns',
      userRewrite: 'to',
    },
  ]);
  recordErrors(db, ['redundancy', 'word_choice', 'redundancy']);

  const ranking = getMistakeRanking(db);

  expect(ranking[0]).toEqual(expect.objectContaining({
    errorType: 'redundancy',
    count: 2,
  }));
  expect(ranking[0].recentExamples).toEqual([
    {
      span: 'in order to',
      userRewrite: 'to',
      rule: 'Drop empty category nouns',
      date: '2026-06-03',
    },
    {
      span: 'in a state of rapid growth',
      userRewrite: 'growing rapidly',
      rule: 'Drop empty category nouns',
      date: '2026-06-01',
    },
  ]);
  expect(ranking[1]).toEqual(expect.objectContaining({ errorType: 'word_choice', count: 1 }));
});

it('returns a filterable mistake log ordered by recent occurrence', () => {
  const first = insertSession(db, { date: '2026-06-01', draftText: 'first' });
  const second = insertSession(db, { date: '2026-06-04', draftText: 'second' });
  insertAnnotations(db, first, [
    {
      paragraphIdx: 0,
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
      rule: 'Drop empty category nouns',
      userRewrite: 'to',
    },
  ]);
  insertAnnotations(db, second, [
    {
      paragraphIdx: 0,
      span: 'support to',
      errorType: 'word_choice',
      hint: 'Check the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'support for',
      rule: 'Fixed preposition collocations',
      userRewrite: 'support for',
    },
  ]);

  expect(getMistakeLog(db, 'redundancy', 5)).toEqual([
    {
      errorType: 'redundancy',
      span: 'in order to',
      userRewrite: 'to',
      rule: 'Drop empty category nouns',
      date: '2026-06-01',
    },
  ]);
  expect(getMistakeLog(db, undefined, 1)).toEqual([
    {
      errorType: 'word_choice',
      span: 'support to',
      userRewrite: 'support for',
      rule: 'Fixed preposition collocations',
      date: '2026-06-04',
    },
  ]);
});
