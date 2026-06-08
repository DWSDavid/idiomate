import { beforeEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { migrate, openDb } from '../src/db/db.js';
import {
  getMistakeRanking,
  getPrimeCandidates,
  getTallies,
  getVocabCount,
  insertAnnotations,
  insertSession,
  recordErrors,
  recordParagraphResult,
  upsertUser,
  upsertVocab,
} from '../src/db/dal.js';

const ALICE = '00000000-0000-4000-8000-000000000001';
const BOB = '00000000-0000-4000-8000-000000000002';

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  upsertUser(db, ALICE, 'Alice');
  upsertUser(db, BOB, 'Bob');
});

async function withServer<T>(app: ReturnType<typeof createApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

it('keeps duplicate normalized vocabulary separate by user', () => {
  const aliceId = upsertVocab(db, ALICE, { word: 'Risk premium', kind: 'phrase', captureCount: 1 });
  const bobId = upsertVocab(db, BOB, { word: ' risk   premium ', kind: 'phrase', captureCount: 1 });
  upsertVocab(db, ALICE, { word: 'Risk premium', kind: 'phrase', captureCount: 1 });

  expect(aliceId).not.toBe(bobId);
  expect(getVocabCount(db, ALICE)).toBe(1);
  expect(getVocabCount(db, BOB)).toBe(1);
  expect(getPrimeCandidates(db, ALICE, 1)[0]).toEqual(expect.objectContaining({
    word: 'Risk premium',
    captureCount: 2,
  }));
  expect(getPrimeCandidates(db, BOB, 1)[0]).toEqual(expect.objectContaining({
    word: 'risk premium',
    captureCount: 1,
  }));
});

it('scopes error tallies, rankings, and paragraph replacement by user', () => {
  const aliceSession = insertSession(db, ALICE, { date: '2026-06-08', draftText: 'alice draft' });
  insertAnnotations(db, ALICE, aliceSession, [
    {
      paragraphIdx: 0,
      span: 'made the implementation',
      errorType: 'noun_plague',
      hint: 'Use a verb.',
      explanation: 'Noun string.',
      modelRewrite: 'implemented',
      userRewrite: 'implemented',
    },
  ]);
  recordErrors(db, ALICE, ['noun_plague']);
  recordErrors(db, BOB, ['redundancy', 'redundancy']);

  recordParagraphResult(db, BOB, {
    date: '2026-06-08',
    paragraphIdx: 0,
    paragraph: 'Bob used filler in order to explain.',
    rewrite: 'Bob used filler to explain.',
    annotations: [{
      span: 'in order to',
      errorType: 'redundancy',
      hint: 'Use fewer words.',
      explanation: 'Redundancy.',
      modelRewrite: 'to',
    }],
  });

  expect(getTallies(db, ALICE)).toEqual([
    expect.objectContaining({ errorType: 'noun_plague', count: 1 }),
  ]);
  expect(getTallies(db, BOB)).toEqual([
    expect.objectContaining({ errorType: 'redundancy', count: 3 }),
  ]);
  expect(getMistakeRanking(db, ALICE)[0].recentExamples[0]).toEqual(expect.objectContaining({
    span: 'made the implementation',
  }));
  expect(JSON.stringify(getMistakeRanking(db, ALICE))).not.toContain('in order to');
  expect(JSON.stringify(getMistakeRanking(db, BOB))).not.toContain('made the implementation');
});

it('requires user headers on api calls and isolates route data', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const missing = await fetch(`${baseUrl}/api/vocab/list`);
    expect(missing.status).toBe(400);

    const aliceSave = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': ALICE,
        'x-user-name': 'Alice',
      },
      body: JSON.stringify({ word: 'Risk premium', kind: 'phrase' }),
    });
    expect(aliceSave.status).toBe(201);

    const bobList = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': BOB, 'x-user-name': 'Bob' },
    });
    expect(bobList.status).toBe(200);
    await expect(bobList.json()).resolves.toEqual({ total: 0, items: [] });

    const aliceList = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': ALICE, 'x-user-name': 'Alice' },
    });
    expect(aliceList.status).toBe(200);
    await expect(aliceList.json()).resolves.toEqual({
      total: 1,
      items: [expect.objectContaining({ word: 'Risk premium' })],
    });
  });
});

it('migrates legacy single-user rows to the local user', () => {
  const legacy = openDb(':memory:');
  legacy.exec(`
    CREATE TABLE vocab (
      id INTEGER PRIMARY KEY, word TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'word', ipa TEXT, def_cn TEXT, pos TEXT,
      status TEXT, source TEXT, context_sentence TEXT, examples TEXT,
      collocations TEXT, register TEXT, capture_count INTEGER DEFAULT 1,
      last_captured TEXT DEFAULT (datetime('now')), date_added TEXT DEFAULT (datetime('now')),
      times_suggested INTEGER DEFAULT 0, times_used INTEGER DEFAULT 0
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY, date TEXT, prompt_id INTEGER, draft_text TEXT,
      final_text TEXT, duration_s INTEGER
    );
    CREATE TABLE annotations (
      id INTEGER PRIMARY KEY, session_id INTEGER, paragraph_idx INTEGER, span_text TEXT,
      error_type TEXT, hint TEXT, explanation TEXT, model_rewrite TEXT,
      user_rewrite TEXT, accepted INTEGER DEFAULT 0
    );
    CREATE TABLE error_tally (
      error_type TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_seen TEXT
    );
    CREATE TABLE sentence_lab_drafts (
      id INTEGER PRIMARY KEY, date TEXT, sentence TEXT NOT NULL, context TEXT,
      response_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO vocab (word, normalized, kind, capture_count, times_suggested, times_used)
    VALUES ('Risk premium', 'risk premium', 'phrase', 1, 0, 0);
    INSERT INTO sessions (date, draft_text) VALUES ('2026-06-08', 'legacy draft');
    INSERT INTO error_tally (error_type, count, last_seen) VALUES ('redundancy', 2, '2026-06-08');
    INSERT INTO sentence_lab_drafts (date, sentence, response_json)
    VALUES ('2026-06-08', 'Legacy sentence.', '{"paragraphIndex":0,"annotations":[]}');
  `);

  migrate(legacy);
  upsertUser(legacy, BOB, 'Bob');
  const bobId = upsertVocab(legacy, BOB, { word: 'Risk premium', kind: 'phrase' });

  expect(getVocabCount(legacy, 'local')).toBe(1);
  expect(getVocabCount(legacy, BOB)).toBe(1);
  expect(getTallies(legacy, 'local')).toEqual([
    expect.objectContaining({ errorType: 'redundancy', count: 2 }),
  ]);
  expect(getPrimeCandidates(legacy, BOB, 1)[0].id).toBe(bobId);
});
