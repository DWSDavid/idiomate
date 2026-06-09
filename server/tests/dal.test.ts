import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import {
  getPrimeCandidates,
  getPrimeCandidatePool,
  getDailyMistakeCounts,
  getVocabCount,
  getVocabList,
  getVocabSample,
  getMistakeLog,
  getMistakeRanking,
  getMistakeTrend,
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
  insertVocab,
  recordErrors,
  getTallies,
  upsertVocab,
} from '../src/db/dal.js';

let db: ReturnType<typeof openDb>;
const USER_ID = 'local';
beforeEach(() => { db = openDb(':memory:'); migrate(db); });

it('inserts and samples vocab', () => {
  insertVocab(db, USER_ID, [{ word: 'leverage', defCn: '鍒╃敤', timesSuggested: 0, timesUsed: 0 }]);
  expect(getVocabSample(db, USER_ID, 5).length).toBe(1);
});

it('upserts vocab by normalized text and accumulates capture count', () => {
  insertVocab(db, USER_ID, [
    { word: ' Risk   premium ', kind: 'phrase', defCn: 'risk return spread', timesSuggested: 0, timesUsed: 0 },
    { word: 'risk premium', defCn: 'duplicate capture', timesSuggested: 0, timesUsed: 0 },
  ]);

  const vocab = getPrimeCandidates(db, USER_ID, 10);
  expect(vocab).toHaveLength(1);
  expect(vocab[0].normalized).toBe('risk premium');
  expect(vocab[0].captureCount).toBe(2);
});

it('selects prime candidates by deterministic weighted priority', () => {
  upsertVocab(db, USER_ID, {
    word: 'plain',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2026-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'risk premium',
    kind: 'phrase',
    captureCount: 3,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'overused',
    kind: 'word',
    captureCount: 9,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 12,
  });

  expect(getPrimeCandidates(db, USER_ID, 2).map(v => v.word)).toEqual(['risk premium', 'plain']);
});

it('lists vocab by the same priority order used for prime candidates', () => {
  upsertVocab(db, USER_ID, {
    word: 'fresh word',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
    defCn: 'newly captured',
  });
  upsertVocab(db, USER_ID, {
    word: 'well worn phrase',
    kind: 'phrase',
    captureCount: 5,
    lastCaptured: '2026-05-10T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
    defCn: 'seen many times',
  });
  upsertVocab(db, USER_ID, {
    word: 'overused term',
    kind: 'word',
    captureCount: 10,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 12,
    defCn: 'already active',
  });

  const list = getVocabList(db, USER_ID, 10);

  expect(getVocabCount(db, USER_ID)).toBe(3);
  expect(list.map(item => item.word)).toEqual(getPrimeCandidates(db, USER_ID, 10).map(item => item.word));
  expect(list[0]).toEqual({
    word: 'well worn phrase',
    kind: 'phrase',
    defCn: 'seen many times',
    captureCount: 5,
    timesSuggested: 0,
    timesUsed: 0,
    lastCaptured: '2026-05-10T00:00:00.000Z',
    capturedDate: '2026-05-10',
  });
});

it('does not label original Youdao imports as newly captured daily vocab', () => {
  upsertVocab(db, USER_ID, {
    word: 'archival phrase',
    kind: 'phrase',
    source: 'youdao',
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
    defCn: 'imported from the original list',
  });
  upsertVocab(db, USER_ID, {
    word: 'today phrase',
    kind: 'phrase',
    source: 'capture',
    captureCount: 1,
    lastCaptured: '2026-06-09T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
    defCn: 'captured today',
  });

  const list = getVocabList(db, USER_ID, 10);

  expect(list.find(item => item.word === 'archival phrase')).toEqual(expect.objectContaining({
    word: 'archival phrase',
    lastCaptured: undefined,
    capturedDate: undefined,
  }));
  expect(list.find(item => item.word === 'today phrase')).toEqual(expect.objectContaining({
    word: 'today phrase',
    lastCaptured: '2026-06-09T00:00:00.000Z',
    capturedDate: '2026-06-09',
  }));
});

it('builds a blended prime pool from priority terms and oldest unused terms', () => {
  upsertVocab(db, USER_ID, {
    word: 'top phrase one',
    kind: 'phrase',
    captureCount: 5,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'top phrase two',
    kind: 'phrase',
    captureCount: 4,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'top phrase three',
    kind: 'phrase',
    captureCount: 3,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'old unused',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2025-01-01T00:00:00.000Z',
    timesSuggested: 9,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'old but used',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2024-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 1,
  });

  const pool = getPrimeCandidatePool(db, USER_ID, '', 4).map(v => v.word);

  expect(pool).toEqual(expect.arrayContaining(['top phrase one', 'top phrase two', 'top phrase three']));
  expect(pool).toContain('old unused');
  expect(pool).not.toContain('old but used');
});

it('increments vocab usage by normalized word', () => {
  upsertVocab(db, USER_ID, { word: 'Leverage', timesSuggested: 0, timesUsed: 0 });
  incrementVocabUsed(db, USER_ID, ' leverage ');

  expect(getPrimeCandidates(db, USER_ID, 1)[0].timesUsed).toBe(1);
});

it('tallies error types across calls', () => {
  recordErrors(db, USER_ID, ['redundancy', 'calque', 'redundancy']);
  const t = getTallies(db, USER_ID);
  expect(t.find(x => x.errorType === 'redundancy')!.count).toBe(2);
});

it('ranks mistakes with recent examples from saved annotations', () => {
  const olderSession = insertSession(db, USER_ID, { date: '2026-06-01', draftText: 'older draft' });
  const newerSession = insertSession(db, USER_ID, { date: '2026-06-03', draftText: 'newer draft' });
  insertAnnotations(db, USER_ID, olderSession, [
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
  insertAnnotations(db, USER_ID, newerSession, [
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
  recordErrors(db, USER_ID, ['redundancy', 'word_choice', 'redundancy']);

  const ranking = getMistakeRanking(db, USER_ID);

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
  const first = insertSession(db, USER_ID, { date: '2026-06-01', draftText: 'first' });
  const second = insertSession(db, USER_ID, { date: '2026-06-04', draftText: 'second' });
  insertAnnotations(db, USER_ID, first, [
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
  insertAnnotations(db, USER_ID, second, [
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

  expect(getMistakeLog(db, USER_ID, 'redundancy', 5)).toEqual([
    {
      errorType: 'redundancy',
      span: 'in order to',
      userRewrite: 'to',
      rule: 'Drop empty category nouns',
      date: '2026-06-01',
    },
  ]);
  expect(getMistakeLog(db, USER_ID, undefined, 1)).toEqual([
    {
      errorType: 'word_choice',
      span: 'support to',
      userRewrite: 'support for',
      rule: 'Fixed preposition collocations',
      date: '2026-06-04',
    },
  ]);
});

it('buckets daily mistake counts by session date and excludes vocab suggestions', () => {
  const first = insertSession(db, USER_ID, { date: '2026-06-03T09:00:00.000Z', draftText: 'first' });
  const second = insertSession(db, USER_ID, { date: '2026-06-04', draftText: 'second' });
  insertAnnotations(db, USER_ID, first, [
    {
      paragraphIdx: 0,
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
    },
    {
      paragraphIdx: 0,
      span: 'support to',
      errorType: 'word_choice',
      hint: 'Check the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'support for',
    },
    {
      paragraphIdx: 0,
      span: 'support',
      errorType: 'vocab_suggestion',
      hint: 'Use your vocab.',
      explanation: 'Vocab opportunity.',
      modelRewrite: 'shore up',
    },
  ]);
  insertAnnotations(db, USER_ID, second, [
    {
      paragraphIdx: 0,
      span: 'implementation of',
      errorType: 'noun_plague',
      hint: 'Use a verb.',
      explanation: 'Noun string.',
      modelRewrite: 'implemented',
    },
  ]);

  expect(getDailyMistakeCounts(db, USER_ID, 30)).toEqual([
    { date: '2026-06-03', count: 2 },
    { date: '2026-06-04', count: 1 },
  ]);
});

it('returns mistake trends for the top error types by overall count', () => {
  const first = insertSession(db, USER_ID, { date: '2026-06-01', draftText: 'first' });
  const second = insertSession(db, USER_ID, { date: '2026-06-02', draftText: 'second' });
  const third = insertSession(db, USER_ID, { date: '2026-06-03', draftText: 'third' });
  insertAnnotations(db, USER_ID, first, [
    {
      paragraphIdx: 0,
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
    },
    {
      paragraphIdx: 0,
      span: 'support to',
      errorType: 'word_choice',
      hint: 'Check the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'support for',
    },
  ]);
  insertAnnotations(db, USER_ID, second, [
    {
      paragraphIdx: 0,
      span: 'in a state of growth',
      errorType: 'redundancy',
      hint: 'Cut filler.',
      explanation: 'Redundancy.',
      modelRewrite: 'growing',
    },
    {
      paragraphIdx: 1,
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
    },
    {
      paragraphIdx: 1,
      span: 'literal phrase',
      errorType: 'calque',
      hint: 'Check the idiom.',
      explanation: 'Direct translation.',
      modelRewrite: 'natural phrase',
    },
  ]);
  insertAnnotations(db, USER_ID, third, [
    {
      paragraphIdx: 0,
      span: 'support to',
      errorType: 'word_choice',
      hint: 'Check the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'support for',
    },
    {
      paragraphIdx: 1,
      span: 'discuss about',
      errorType: 'word_choice',
      hint: 'Drop the preposition.',
      explanation: 'Collocation.',
      modelRewrite: 'discuss',
    },
    {
      paragraphIdx: 1,
      span: 'shore up',
      errorType: 'vocab_suggestion',
      hint: 'Use your vocab.',
      explanation: 'Vocab opportunity.',
      modelRewrite: 'shore up',
    },
  ]);

  expect(getMistakeTrend(db, USER_ID, 30, 2)).toEqual([
    {
      errorType: 'redundancy',
      points: [
        { date: '2026-06-01', count: 1 },
        { date: '2026-06-02', count: 2 },
      ],
    },
    {
      errorType: 'word_choice',
      points: [
        { date: '2026-06-01', count: 1 },
        { date: '2026-06-03', count: 2 },
      ],
    },
  ]);
});
