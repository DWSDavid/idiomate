import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { openDb, migrate } from '../src/db/db.js';
import { detectPreposition, buildPatternCue, rulePatternFrom } from '../../shared/types.js';
import {
  assemblePatternUsagePrompt,
  sanitizeCombos,
} from '../src/brain/patterns.js';
import { insertPattern, listPatterns, recordPatternReview, deletePattern, upsertVocab } from '../src/db/dal.js';
import { scanVocabForPatterns, autoAddRulePattern } from '../src/patternScan.js';
import type { LLMProvider } from '../src/brain/provider.js';

const USER_ID = 'local';
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
});

afterEach(() => {
  db.close();
});

async function withServer<T>(app: ReturnType<typeof createApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (String(input).includes(`:${address.port}/api`)) {
      headers.set('x-user-id', USER_ID);
      headers.set('x-user-name', 'Local');
    }
    return originalFetch(input, { ...init, headers });
  }) as typeof fetch;
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

it('detects the preposition and blanks it (longest match wins)', () => {
  expect(detectPreposition('on the stage')).toBe('on');
  expect(detectPreposition('at a specific event')).toBe('at');
  expect(detectPreposition('play with')).toBe('with');
  expect(detectPreposition('according to the report')).toBe('according to');
  expect(buildPatternCue('on the stage', 'on')).toBe('___ the stage');
  expect(buildPatternCue('play with', 'with')).toBe('play ___');
});

it('inserts, lists (grouped by preposition), reviews, and deletes patterns', () => {
  const a = insertPattern(db, USER_ID, { phrase: 'on the stage', preposition: 'on', cue: '___ the stage' });
  insertPattern(db, USER_ID, { phrase: 'at an event', preposition: 'at', cue: '___ an event' });

  const list = listPatterns(db, USER_ID);
  expect(list.map(p => p.preposition)).toEqual(['at', 'on']); // ordered by preposition

  const reviewed = recordPatternReview(db, USER_ID, a.id, true);
  expect(reviewed?.timesSeen).toBe(1);
  expect(reviewed?.timesCorrect).toBe(1);
  const wrong = recordPatternReview(db, USER_ID, a.id, false);
  expect(wrong?.timesSeen).toBe(2);
  expect(wrong?.timesCorrect).toBe(1);

  expect(deletePattern(db, USER_ID, a.id)).toBe(true);
  expect(listPatterns(db, USER_ID)).toHaveLength(1);
});

it('assembles a usage-check prompt with the required preposition', () => {
  const prompt = assemblePatternUsagePrompt({ phrase: 'on the stage', preposition: 'on', sentence: 'She stood on the stage.' });
  expect(prompt.user).toContain('on the stage');
  expect(prompt.user).toContain('Required preposition: on');
  expect(prompt.system).toContain('Return ONLY JSON matching: {correct,feedback,modelSentence}');
});

it('POST /api/patterns auto-detects the preposition and stores the cue', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase: 'on the stage' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.preposition).toBe('on');
    expect(json.cue).toBe('___ the stage');

    const list = await (await fetch(`${baseUrl}/api/patterns`)).json();
    expect(list.items).toHaveLength(1);
  });
});

it('rulePatternFrom extracts patterns from prepositional phrases and rejects others', () => {
  expect(rulePatternFrom('brush up on')).toEqual({ phrase: 'brush up on', preposition: 'on', cue: 'brush up ___' });
  expect(rulePatternFrom('keen on')).toEqual({ phrase: 'keen on', preposition: 'on', cue: 'keen ___' });
  expect(rulePatternFrom('backlash')).toBeNull(); // single word, no preposition
});

it('sanitizeCombos keeps only real prepositions that appear in the phrase', () => {
  const clean = sanitizeCombos([
    { phrase: 'register for', preposition: 'for' },
    { phrase: 'depend on', preposition: 'on' },
    { phrase: 'made up nonsense', preposition: 'xyz' }, // not a preposition -> dropped
    { phrase: 'register for', preposition: 'for' },      // duplicate -> dropped
    { phrase: 'commit', preposition: 'to' },             // preposition not in phrase -> dropped
  ]);
  expect(clean).toEqual([
    { phrase: 'register for', preposition: 'for' },
    { phrase: 'depend on', preposition: 'on' },
  ]);
});

it('scanVocabForPatterns rule-harvests phrases and AI-detects bare-word combos', async () => {
  upsertVocab(db, USER_ID, { word: 'keen on', normalized: 'keen on', kind: 'collocation', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'register', normalized: 'register', kind: 'word', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'backlash', normalized: 'backlash', kind: 'word', timesSuggested: 0, timesUsed: 0 });

  const provider: LLMProvider = {
    async complete(opts) {
      // Only the bare words (register, backlash) reach the AI pass.
      expect(opts.user).toContain('register');
      expect(opts.user).not.toContain('keen on');
      return JSON.stringify({ patterns: [{ phrase: 'register for', preposition: 'for' }] });
    },
  };

  const result = await scanVocabForPatterns(db, provider, USER_ID, 'm');
  expect(result.added).toBe(2); // 'keen on' (rule) + 'register for' (AI)
  const phrases = listPatterns(db, USER_ID).map(p => p.phrase).sort();
  expect(phrases).toEqual(['keen on', 'register for']);
});

it('autoAddRulePattern banks prepositional phrases on save but skips bare words (no AI)', () => {
  expect(autoAddRulePattern(db, USER_ID, 'brush up on')).toBe(true);
  expect(listPatterns(db, USER_ID).map(p => p.phrase)).toContain('brush up on');

  // A bare word has no preposition to blank, so the save-time hook adds nothing (Scan/AI does).
  expect(autoAddRulePattern(db, USER_ID, 'register')).toBe(false);
  expect(listPatterns(db, USER_ID).map(p => p.phrase)).not.toContain('register for');
});

it('POST /api/patterns/check-usage grades a sentence with the utility model', async () => {
  const utilityProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({ correct: true, feedback: 'Correct use of "on".', modelSentence: 'She stood on the stage.' });
    },
  };
  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/patterns/check-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase: 'on the stage', preposition: 'on', sentence: 'He appeared on the stage.' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.correct).toBe(true);
    expect(json.modelSentence).toContain('on the stage');
  });
});
