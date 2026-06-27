import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import {
  getDeepDiveCache,
  getPrimeCandidates,
  getPrimeCandidatePool,
  getDailyMistakeCounts,
  getMemoryProfile,
  getReviewQueue,
  getSessionEmbeddings,
  getTodayVocab,
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
  mergeVocabFamilies,
  recordReview,
  recordErrors,
  saveDeepDive,
  getTallies,
  upsertSessionEmbedding,
  upsertVocab,
} from '../src/db/dal.js';

let db: ReturnType<typeof openDb>;
const USER_ID = 'local';
beforeEach(() => { db = openDb(':memory:'); migrate(db); });

it('inserts and samples vocab', () => {
  insertVocab(db, USER_ID, [{ word: 'leverage', defCn: '鍒╃敤', timesSuggested: 0, timesUsed: 0 }]);
  expect(getVocabSample(db, USER_ID, 5).length).toBe(1);
});

it('migrates review metadata and session embedding storage', () => {
  const vocabColumns = db.prepare('PRAGMA table_info(vocab)').all() as Array<{ name: string }>;
  expect(vocabColumns.map(column => column.name)).toEqual(expect.arrayContaining([
    'ease',
    'last_reviewed',
    'word_family',
    'near_synonyms',
    'base_form',
  ]));

  const embeddingTable = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'session_embeddings'
  `).get() as { name: string } | undefined;
  expect(embeddingTable?.name).toBe('session_embeddings');
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

it('stores base-form metadata for captured vocab', () => {
  const id = upsertVocab(db, USER_ID, {
    word: 'running',
    normalized: 'running',
    baseForm: 'run',
    kind: 'word',
    timesSuggested: 0,
    timesUsed: 0,
  });

  const row = db.prepare('SELECT base_form FROM vocab WHERE id = ?').get(id) as { base_form: string };
  expect(row.base_form).toBe('run');
  expect(getPrimeCandidates(db, USER_ID, 1)[0]).toEqual(expect.objectContaining({
    word: 'running',
    baseForm: 'run',
  }));
});

it('merges vocab families into one primary row and is idempotent', () => {
  upsertVocab(db, USER_ID, {
    word: 'fortune',
    normalized: 'fortune',
    wordFamily: ['fortune', 'fortunes'],
    captureCount: 2,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'fortunes',
    normalized: 'fortunes',
    captureCount: 3,
    lastCaptured: '2026-06-05T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, 'other-user', {
    word: 'fortunes',
    normalized: 'fortunes',
    captureCount: 7,
    timesSuggested: 0,
    timesUsed: 0,
  });

  expect(mergeVocabFamilies(db, USER_ID)).toEqual({ merged: 1 });
  expect(mergeVocabFamilies(db, USER_ID)).toEqual({ merged: 0 });

  const rows = db.prepare(`
    SELECT word, capture_count, last_captured
    FROM vocab
    WHERE user_id = ?
    ORDER BY id
  `).all(USER_ID);
  expect(rows).toEqual([
    {
      word: 'fortune',
      capture_count: 5,
      last_captured: '2026-06-05T00:00:00.000Z',
    },
  ]);
  expect(db.prepare('SELECT COUNT(*) AS count FROM vocab WHERE user_id = ?').get('other-user')).toEqual({ count: 1 });
});

it('maps review and deep-dive vocab metadata through upsert and review queue reads', () => {
  const allocationId = upsertVocab(db, USER_ID, {
    word: 'allocation',
    kind: 'word',
    ease: 'hard',
    lastReviewed: '2026-06-20T00:00:00.000Z',
    wordFamily: ['allocate', 'allocated', 'allocation'],
    nearSynonyms: [{ word: 'assign', distinction: 'Use assign for ownership or tasks.' }],
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'fresh',
    kind: 'word',
    ease: 'new',
    lastCaptured: '2026-06-22T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'confident',
    kind: 'word',
    ease: 'easy',
    lastReviewed: '2026-06-23T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });

  const queue = getReviewQueue(db, USER_ID, 10);

  expect(queue.map(item => item.word)).toEqual(['fresh', 'allocation', 'confident']);
  expect(queue.find(item => item.id === allocationId)).toEqual(expect.objectContaining({
    ease: 'hard',
    lastReviewed: '2026-06-20T00:00:00.000Z',
    wordFamily: ['allocate', 'allocated', 'allocation'],
    nearSynonyms: [{ word: 'assign', distinction: 'Use assign for ownership or tasks.' }],
  }));
});

it('records review results only for the scoped user', () => {
  const localId = upsertVocab(db, USER_ID, { word: 'local word', timesSuggested: 0, timesUsed: 0 });
  const otherId = upsertVocab(db, 'other-user', { word: 'other word', timesSuggested: 0, timesUsed: 0 });

  recordReview(db, USER_ID, localId, 'easy');
  recordReview(db, USER_ID, otherId, 'hard');

  expect(getReviewQueue(db, USER_ID, 10).find(item => item.id === localId)).toEqual(expect.objectContaining({
    ease: 'easy',
    lastReviewed: expect.any(String),
  }));
  const other = db.prepare('SELECT ease, last_reviewed FROM vocab WHERE id = ?').get(otherId) as {
    ease: string;
    last_reviewed: string | null;
  };
  expect(other).toEqual({ ease: 'new', last_reviewed: null });
});

it('saves and reads cached deep dives from vocab metadata', () => {
  const id = upsertVocab(db, USER_ID, {
    word: 'allocate',
    examples: ['The team allocated capital carefully.'],
    timesSuggested: 0,
    timesUsed: 0,
  });

  expect(getDeepDiveCache(db, USER_ID, id)).toBeNull();

  saveDeepDive(db, USER_ID, id, {
    wordFamily: ['allocate', 'allocated', 'allocation'],
    nearSynonyms: [{ word: 'assign', distinction: 'Use assign for tasks or ownership.' }],
    usageExamples: ['Generated examples are returned on the first request.'],
  });

  expect(getDeepDiveCache(db, USER_ID, id)).toEqual({
    wordFamily: ['allocate', 'allocated', 'allocation'],
    nearSynonyms: [{ word: 'assign', distinction: 'Use assign for tasks or ownership.' }],
    usageExamples: ['The team allocated capital carefully.'],
  });
});

it('stores session embeddings and filters them by user', () => {
  upsertSessionEmbedding(db, 1, USER_ID, 'local content', [1, 0, 0]);
  upsertSessionEmbedding(db, 2, 'other-user', 'other content', [0, 1, 0]);

  expect(getSessionEmbeddings(db, USER_ID)).toEqual([
    { sessionId: 1, content: 'local content', embedding: [1, 0, 0] },
  ]);
});

it('returns today vocab and memory profile summaries by user', () => {
  upsertVocab(db, USER_ID, { word: 'today new', timesSuggested: 0, timesUsed: 0 });
  const hardId = upsertVocab(db, USER_ID, { word: 'today hard', ease: 'hard', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, {
    word: 'old easy',
    ease: 'easy',
    lastCaptured: '2000-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });
  recordErrors(db, USER_ID, ['noun_plague', 'noun_plague', 'word_choice']);
  const sessionId = insertSession(db, USER_ID, { draftText: 'draft', finalText: 'final' });
  upsertSessionEmbedding(db, sessionId, USER_ID, 'draft final', [0.5, 0.5]);
  upsertVocab(db, 'other-user', { word: 'other today', timesSuggested: 0, timesUsed: 0 });

  expect(getTodayVocab(db, USER_ID, 10).map(item => item.id)).toContain(hardId);
  expect(getTodayVocab(db, USER_ID, 10).map(item => item.word)).not.toContain('old easy');
  expect(getMemoryProfile(db, USER_ID)).toEqual({
    topWeaknesses: [
      { errorType: 'noun_plague', count: 2 },
      { errorType: 'word_choice', count: 1 },
    ],
    totalSessions: 1,
    sessionEmbeddingsCount: 1,
    vocabCount: 3,
    vocabByEase: { new: 1, hard: 1, easy: 1 },
  });
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
    pos: 'noun',
    nearSynonyms: [{ word: 'familiar expression', distinction: 'Use this for a phrase readers know well.' }],
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
    id: expect.any(Number),
    word: 'well worn phrase',
    kind: 'phrase',
    defCn: 'seen many times',
    pos: 'noun',
    nearSynonyms: [{ word: 'familiar expression', distinction: 'Use this for a phrase readers know well.' }],
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
