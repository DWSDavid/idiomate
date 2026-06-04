import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { openDb, migrate } from '../src/db/db.js';
import { getPrimeCandidates, getTallies, insertVocab, recordErrors, upsertVocab } from '../src/db/dal.js';
import type { LLMProvider } from '../src/brain/provider.js';

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
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

it('POST /api/coach returns annotations without updating error tallies', async () => {
  const coachProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [{
          span: 'in order to',
          errorType: 'redundancy',
          hint: 'Use fewer words.',
          explanation: 'Redundancy: this phrase is wordy.',
          modelRewrite: 'to',
        }],
      });
    },
  };

  await withServer(createApp({ db, coachProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We did X in order to Y.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.annotations[0].errorType).toBe('redundancy');
    expect(getTallies(db)).toEqual([]);
  });
});

it('POST /api/sessions records errors and increments accepted vocab suggestions', async () => {
  insertVocab(db, [{ word: 'shore up', kind: 'phrase', timesSuggested: 0, timesUsed: 0 }]);

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftText: 'We need support margins.',
        finalText: 'We need to shore up margins.',
        durationS: 120,
        annotations: [
          {
            paragraphIdx: 0,
            span: 'in order to',
            errorType: 'redundancy',
            hint: 'Use fewer words.',
            explanation: 'Redundancy.',
            modelRewrite: 'to',
            userRewrite: 'to',
            accepted: false,
          },
          {
            paragraphIdx: 0,
            span: 'support',
            errorType: 'vocab_suggestion',
            hint: 'A phrase from your vocab fits here.',
            explanation: 'Vocab opportunity.',
            modelRewrite: 'shore up',
            vocabWord: 'shore up',
            userRewrite: 'shore up',
            accepted: true,
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toEqual(expect.any(Number));
    expect(getTallies(db)).toEqual([
      expect.objectContaining({ errorType: 'redundancy', count: 1 }),
    ]);
    expect(getPrimeCandidates(db, 1)[0].timesUsed).toBe(1);
  });
});

it('POST /api/vocab/save upserts and GET /api/vocab/prime returns weighted candidates', async () => {
  upsertVocab(db, { word: 'plain', kind: 'word', captureCount: 1, timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, { word: 'overused', kind: 'word', captureCount: 9, timesSuggested: 0, timesUsed: 12 });

  await withServer(createApp({ db }), async baseUrl => {
    for (let i = 0; i < 2; i += 1) {
      const save = await fetch(`${baseUrl}/api/vocab/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: ' Risk premium ', kind: 'phrase', defCn: 'risk-return spread' }),
      });
      expect(save.status).toBe(201);
    }

    const prime = await fetch(`${baseUrl}/api/vocab/prime?topic=markets`);
    expect(prime.status).toBe(200);
    const json = await prime.json();
    expect(json.vocab[0].word).toBe('Risk premium');
    expect(json.vocab[0].captureCount).toBe(2);

    const saved = getPrimeCandidates(db, 1)[0];
    expect(saved.normalized).toBe('risk premium');
    expect(saved.timesSuggested).toBe(1);
  });
});

it('POST /api/vocab/capture returns an enriched preview without saving', async () => {
  const utilityProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        word: 'shore up',
        kind: 'phrase',
        defCn: 'support or strengthen',
        contextSentence: 'We need to shore up margins.',
        examples: ['They moved quickly to shore up confidence.'],
        collocations: ['shore up margins'],
        register: 'business',
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'shore up', contextSentence: 'We need to shore up margins.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      word: 'shore up',
      kind: 'phrase',
      defCn: 'support or strengthen',
      source: 'capture',
      timesSuggested: 0,
      timesUsed: 0,
    }));
    expect(getPrimeCandidates(db, 1)).toEqual([]);
  });
});

it('POST /api/vocab/import parses a raw Youdao export', async () => {
  const body = '1, esoteric  [ˌiːsəˈterɪk]  英译中\nadj. 只有内行才懂的\n未分组单词';

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ count: 1 });
    expect(getPrimeCandidates(db, 1)[0].word).toBe('esoteric');
  });
});

it('GET /api/prompt/today returns a local writing prompt', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/prompt/today`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.date).toEqual(expect.any(String));
    expect(json.theme).toEqual(expect.any(String));
    expect(json.text).toContain('?');
  });
});

it('GET /api/profile returns error tallies and activation stats', async () => {
  recordErrors(db, ['noun_plague', 'noun_plague', 'redundancy']);
  upsertVocab(db, {
    word: 'shore up',
    kind: 'phrase',
    timesSuggested: 3,
    timesUsed: 1,
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/profile`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tallies[0]).toEqual(expect.objectContaining({ errorType: 'noun_plague', count: 2 }));
    expect(json.activation).toEqual({ suggested: 3, used: 1 });
  });
});
