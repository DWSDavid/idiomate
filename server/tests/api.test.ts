import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { openDb, migrate } from '../src/db/db.js';
import {
  getPrimeCandidates,
  getMistakeLog,
  getTallies,
  insertAnnotations,
  insertSession,
  insertVocab,
  recordErrors,
  upsertVocab,
} from '../src/db/dal.js';
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

it('POST /api/coach attaches local Chinglish book references to annotations', async () => {
  const coachProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [{
          span: 'implementation of the policy',
          errorType: 'noun_plague',
          hint: 'Turn the heavy noun phrase into a verb.',
          explanation: 'Noun plague: the noun is carrying the action.',
          rule: 'Prefer a verb over a noun string',
          ruleExample: {
            before: 'implementation of the policy',
            after: 'implemented the policy',
          },
          modelRewrite: 'implemented the policy',
        }],
        nativeVersion: 'We implemented the policy.',
      });
    },
  };

  await withServer(createApp({ db, coachProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We carried out the implementation of the policy.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.annotations[0].bookReference).toEqual(expect.objectContaining({
      source: "The Translator's Guide to Chinglish",
      pattern: expect.stringContaining('Noun Plague'),
      quote: expect.stringContaining('real action'),
    }));
    expect(getTallies(db)).toEqual([]);
  });
});

it('POST /api/sentence-lab diagnoses without revealing fixes, then records after user rewrite', async () => {
  const coachProvider: LLMProvider = {
    async complete(opts) {
      expect(opts.system).toContain('Sentence Lab');
      expect(opts.user).toContain('Context: Slack update to my manager');
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [{
          span: 'made the implementation',
          errorType: 'noun_plague',
          hint: 'Find the action and make it the verb.',
          explanation: 'Noun plague: the sentence hides the action inside an abstract noun.',
          rule: 'Prefer a verb over a noun string',
          ruleExample: {
            before: 'made the implementation',
            after: 'implemented',
          },
          modelRewrite: 'implemented',
        }],
        nativeVersion: 'We implemented the policy yesterday.',
      });
    },
  };

  await withServer(createApp({ db, coachProvider }), async baseUrl => {
    const diagnose = await fetch(`${baseUrl}/api/sentence-lab/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sentence: 'We made the implementation of the policy yesterday.',
        context: 'Slack update to my manager',
      }),
    });

    expect(diagnose.status).toBe(201);
    const diagnosis = await diagnose.json();
    expect(diagnosis).toEqual(expect.objectContaining({
      id: expect.any(Number),
      sentence: 'We made the implementation of the policy yesterday.',
      context: 'Slack update to my manager',
      notes: [
        expect.objectContaining({
          span: 'made the implementation',
          errorType: 'noun_plague',
          hint: 'Find the action and make it the verb.',
          bookReference: expect.objectContaining({
            source: "The Translator's Guide to Chinglish",
          }),
        }),
      ],
    }));
    expect(JSON.stringify(diagnosis)).not.toContain('We implemented the policy yesterday');
    expect(JSON.stringify(diagnosis)).not.toContain('modelRewrite');
    expect(JSON.stringify(diagnosis)).not.toContain('"after"');

    const result = await fetch(`${baseUrl}/api/sentence-lab/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: diagnosis.id,
        rewrite: 'We implemented the policy yesterday.',
      }),
    });

    expect(result.status).toBe(200);
    const revealed = await result.json();
    expect(revealed.nativeVersion).toBe('We implemented the policy yesterday.');
    expect(revealed.annotations[0]).toEqual(expect.objectContaining({
      modelRewrite: 'implemented',
      userRewrite: 'We implemented the policy yesterday.',
      bookReference: expect.objectContaining({
        pattern: expect.stringContaining('Noun Plague'),
      }),
    }));
    expect(getTallies(db)).toEqual([
      expect.objectContaining({ errorType: 'noun_plague', count: 1 }),
    ]);
    expect(getMistakeLog(db, 'noun_plague', 1)).toEqual([
      expect.objectContaining({
        span: 'made the implementation',
        userRewrite: 'We implemented the policy yesterday.',
      }),
    ]);

    const duplicate = await fetch(`${baseUrl}/api/sentence-lab/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: diagnosis.id,
        rewrite: 'We implemented the policy yesterday.',
      }),
    });
    expect(duplicate.status).toBe(200);
    expect(getTallies(db)).toEqual([
      expect.objectContaining({ errorType: 'noun_plague', count: 1 }),
    ]);
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
            rule: 'Drop empty category nouns',
            ruleExample: { before: 'in order to', after: 'to' },
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
    const row = db.prepare(`
      SELECT rule, rule_example
      FROM annotations
      WHERE span_text = ?
    `).get('in order to') as { rule: string; rule_example: string };
    expect(row.rule).toBe('Drop empty category nouns');
    expect(JSON.parse(row.rule_example)).toEqual({ before: 'in order to', after: 'to' });
  });
});

it('POST /api/paragraph-result records a paragraph rewrite idempotently', async () => {
  insertVocab(db, [{ word: 'shore up', kind: 'phrase', timesSuggested: 0, timesUsed: 0 }]);

  await withServer(createApp({ db }), async baseUrl => {
    const body = {
      date: '2026-06-05',
      promptId: 1,
      paragraphIdx: 0,
      paragraph: 'We need support margins in order to calm investors.',
      rewrite: 'We need to shore up margins to calm investors.',
      annotations: [
        {
          span: 'in order to',
          errorType: 'redundancy',
          hint: 'Use fewer words.',
          explanation: 'Redundancy.',
          rule: 'Drop empty category nouns',
          ruleExample: { before: 'in order to', after: 'to' },
          modelRewrite: 'to',
        },
        {
          span: 'support',
          errorType: 'vocab_suggestion',
          hint: 'A phrase from your vocab fits here.',
          explanation: 'Vocab opportunity.',
          modelRewrite: 'shore up',
          vocabWord: 'shore up',
          accepted: true,
        },
      ],
    };

    const first = await fetch(`${baseUrl}/api/paragraph-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const duplicate = await fetch(`${baseUrl}/api/paragraph-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(getTallies(db)).toEqual([
      expect.objectContaining({ errorType: 'redundancy', count: 1 }),
    ]);
    expect(getPrimeCandidates(db, 1)[0].timesUsed).toBe(1);

    const replacement = await fetch(`${baseUrl}/api/paragraph-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        rewrite: 'We need to shore up margins to calm investors quickly.',
        annotations: [
          {
            span: 'support',
            errorType: 'vocab_suggestion',
            hint: 'A phrase from your vocab fits here.',
            explanation: 'Vocab opportunity.',
            modelRewrite: 'shore up',
            vocabWord: 'shore up',
            accepted: true,
          },
        ],
      }),
    });

    expect(replacement.status).toBe(200);
    expect(getTallies(db)).toEqual([]);
    expect(getPrimeCandidates(db, 1)[0].timesUsed).toBe(1);
    const sessions = db.prepare('SELECT id FROM sessions').all() as { id: number }[];
    expect(sessions).toHaveLength(1);
    const rows = db.prepare(`
      SELECT paragraph_idx, span_text, user_rewrite
      FROM annotations
      ORDER BY id
    `).all() as { paragraph_idx: number; span_text: string; user_rewrite: string }[];
    expect(rows).toEqual([
      {
        paragraph_idx: 0,
        span_text: 'support',
        user_rewrite: 'We need to shore up margins to calm investors quickly.',
      },
    ]);
  });
});

it('POST /api/vocab/save upserts and GET /api/vocab/prime returns LLM-selected topic-fit candidates', async () => {
  upsertVocab(db, { word: 'plain', kind: 'word', captureCount: 1, timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, { word: 'overused', kind: 'word', captureCount: 9, timesSuggested: 0, timesUsed: 12 });
  let captured: { system: string; user: string; model: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({ words: ['Risk premium'] });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    for (let i = 0; i < 2; i += 1) {
      const save = await fetch(`${baseUrl}/api/vocab/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: ' Risk premium ', kind: 'phrase', defCn: 'risk-return spread' }),
      });
      expect(save.status).toBe(201);
    }

    const promptText = 'Should investors treat AI infrastructure spending as a durable moat or a near-term margin risk?';
    const prime = await fetch(`${baseUrl}/api/vocab/prime?promptText=${encodeURIComponent(promptText)}`);
    expect(prime.status).toBe(200);
    const json = await prime.json();
    expect(json.vocab[0].word).toBe('Risk premium');
    expect(json.vocab[0].captureCount).toBe(2);
    expect(json.limit).toBe(10);
    expect(captured!.user).toContain(promptText);
    expect(captured!.system).toContain('10');

    const saved = getPrimeCandidates(db, 1)[0];
    expect(saved.normalized).toBe('risk premium');
    expect(saved.timesSuggested).toBe(1);
  });
});

it('GET /api/vocab/list returns priority-ordered vocab with total count', async () => {
  upsertVocab(db, {
    word: 'fresh word',
    kind: 'word',
    captureCount: 1,
    lastCaptured: '2026-06-04T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
    defCn: 'newly captured',
  });
  upsertVocab(db, {
    word: 'well worn phrase',
    kind: 'phrase',
    captureCount: 5,
    lastCaptured: '2026-05-10T00:00:00.000Z',
    timesSuggested: 2,
    timesUsed: 1,
    defCn: 'seen many times',
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/list?limit=1`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(2);
    expect(json.items).toEqual([
      {
        word: 'well worn phrase',
        kind: 'phrase',
        defCn: 'seen many times',
        captureCount: 5,
        timesSuggested: 2,
        timesUsed: 1,
        lastCaptured: '2026-05-10T00:00:00.000Z',
      },
    ]);
  });
});

it('POST /api/vocab/save returns existed true and incremented captureCount for an existing normalized term', async () => {
  upsertVocab(db, {
    word: 'Risk premium',
    kind: 'phrase',
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: ' risk   premium ', kind: 'phrase', defCn: 'risk-return spread' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({
      id: expect.any(Number),
      captureCount: 2,
      existed: true,
    });
    expect(getPrimeCandidates(db, 1)[0].captureCount).toBe(2);
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

it('GET /api/prompt/today generates a fresh news-grounded prompt through the utility model', async () => {
  let calls = 0;
  let captured: { system: string; user: string; model: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      calls += 1;
      captured = opts;
      return JSON.stringify({
        theme: 'humanoid robotics',
        text: `What is your view on humanoid robotics changing workplace productivity angle ${calls}?`,
      });
    },
  };

  await withServer(createApp({
    db,
    utilityProvider,
    headlineFetcher: async () => ['Humanoid robots enter warehouses', 'Robotics firms sign chip deals'],
  }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/prompt/today`);
    const second = await fetch(`${baseUrl}/api/prompt/today`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(firstJson.text).toContain('angle 1');
    expect(secondJson.text).toContain('angle 2');
    expect(calls).toBe(2);
    expect(captured!.user).toContain('Humanoid robots enter warehouses');
  });
});

it('GET /api/prompt/today falls back to LLM-only generation when news fetch fails', async () => {
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      expect(opts.user).toContain('No fresh headlines were available');
      return JSON.stringify({
        theme: 'financial markets',
        text: 'What is your view on how investors should discuss market uncertainty without overstating risk?',
      });
    },
  };

  await withServer(createApp({
    db,
    utilityProvider,
    headlineFetcher: async () => {
      throw new Error('offline');
    },
  }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/prompt/today`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.date).toEqual(expect.any(String));
    expect(json.text).toContain('?');
  });
});

it('GET /api/profile returns error tallies, ranking, and activation stats', async () => {
  const sessionId = insertSession(db, { date: '2026-06-05', draftText: 'draft' });
  insertAnnotations(db, sessionId, [
    {
      paragraphIdx: 0,
      span: 'carried out the implementation',
      errorType: 'noun_plague',
      hint: 'Use a verb.',
      explanation: 'Noun string.',
      modelRewrite: 'implemented',
      rule: 'Prefer a verb over a noun string',
      userRewrite: 'implemented',
    },
  ]);
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
    expect(json.ranking[0]).toEqual(expect.objectContaining({
      errorType: 'noun_plague',
      count: 2,
      recentExamples: [
        {
          span: 'carried out the implementation',
          userRewrite: 'implemented',
          rule: 'Prefer a verb over a noun string',
          date: '2026-06-05',
        },
      ],
    }));
    expect(json.activation).toEqual({ suggested: 3, used: 1 });
  });
});

it('GET /api/progress returns daily mistake counts and top-type trends', async () => {
  const first = insertSession(db, { date: '2026-06-03', draftText: 'first' });
  const second = insertSession(db, { date: '2026-06-04', draftText: 'second' });
  insertAnnotations(db, first, [
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
  insertAnnotations(db, second, [
    {
      paragraphIdx: 0,
      span: 'in a state of growth',
      errorType: 'redundancy',
      hint: 'Cut filler.',
      explanation: 'Redundancy.',
      modelRewrite: 'growing',
    },
    {
      paragraphIdx: 0,
      span: 'literal phrase',
      errorType: 'calque',
      hint: 'Check the idiom.',
      explanation: 'Direct translation.',
      modelRewrite: 'natural phrase',
    },
    {
      paragraphIdx: 0,
      span: 'shore up',
      errorType: 'vocab_suggestion',
      hint: 'Use your vocab.',
      explanation: 'Vocab opportunity.',
      modelRewrite: 'shore up',
    },
  ]);

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/progress?days=30&topN=2`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.daily).toEqual([
      { date: '2026-06-03', count: 2 },
      { date: '2026-06-04', count: 2 },
    ]);
    expect(json.trend).toEqual([
      {
        errorType: 'redundancy',
        points: [
          { date: '2026-06-03', count: 1 },
          { date: '2026-06-04', count: 1 },
        ],
      },
      {
        errorType: 'calque',
        points: [
          { date: '2026-06-04', count: 1 },
        ],
      },
    ]);
  });
});

it('GET /api/mistakes returns a drill-down log optionally filtered by type', async () => {
  const older = insertSession(db, { date: '2026-06-01', draftText: 'older' });
  const newer = insertSession(db, { date: '2026-06-05', draftText: 'newer' });
  insertAnnotations(db, older, [
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
  insertAnnotations(db, newer, [
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

  await withServer(createApp({ db }), async baseUrl => {
    const all = await fetch(`${baseUrl}/api/mistakes?limit=1`);
    expect(all.status).toBe(200);
    await expect(all.json()).resolves.toEqual({
      mistakes: [
        {
          errorType: 'word_choice',
          span: 'support to our peer',
          userRewrite: 'support for our peer',
          rule: 'Fixed preposition collocations',
          date: '2026-06-05',
        },
      ],
    });

    const filtered = await fetch(`${baseUrl}/api/mistakes?type=redundancy`);
    expect(filtered.status).toBe(200);
    const json = await filtered.json();
    expect(json.mistakes).toEqual([
      {
        errorType: 'redundancy',
        span: 'in order to',
        userRewrite: 'to',
        rule: 'Drop empty category nouns',
        date: '2026-06-01',
      },
    ]);
  });
});

it('GET /api/lesson returns a systematic lesson for a requested mistake type', async () => {
  const sessionId = insertSession(db, { date: '2026-06-05', draftText: 'draft' });
  insertAnnotations(db, sessionId, [
    {
      paragraphIdx: 0,
      span: 'implementation of the policy',
      errorType: 'noun_plague',
      hint: 'Use a verb.',
      explanation: 'Noun string.',
      modelRewrite: 'implemented the policy',
      rule: 'Prefer a verb over a noun string',
      userRewrite: 'implemented the policy',
    },
  ]);
  recordErrors(db, ['noun_plague']);
  let captured: { system: string; user: string; model: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        principle: '把抽象名词链改成更有动作感的英文动词结构。',
        mindset: '先问 who does what, 再决定名词是否真的需要。',
        extraPairs: [
          { before: 'made a decision on the issue', after: 'decided the issue' },
          { before: 'conducted an analysis of demand', after: 'analyzed demand' },
          { before: 'achieved the reduction of costs', after: 'reduced costs' },
        ],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/lesson?type=noun_plague`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      errorType: 'noun_plague',
      principle: '把抽象名词链改成更有动作感的英文动词结构。',
      mindset: '先问 who does what, 再决定名词是否真的需要。',
    }));
    expect(json.rules[0]).toEqual(expect.objectContaining({
      name: 'Prefer a verb over a noun string',
      principle: expect.any(String),
      bookReference: {
        source: "The Translator's Guide to Chinglish",
        pattern: expect.stringContaining('Noun Plague'),
        quote: expect.stringContaining('real action'),
        exampleBefore: 'carried out the implementation of the policy',
        exampleAfter: 'implemented the policy',
      },
    }));
    expect(json.pastInstances).toEqual([
      {
        errorType: 'noun_plague',
        span: 'implementation of the policy',
        userRewrite: 'implemented the policy',
        rule: 'Prefer a verb over a noun string',
        date: '2026-06-05',
      },
    ]);
    expect(json.comparisonPairs).toHaveLength(4);
    expect(json.comparisonPairs[0]).toEqual({
      before: 'carried out the implementation of the policy',
      after: 'implemented the policy',
    });
    expect(captured!.model).toBe('gpt-4o');
    expect(captured!.user).toContain('implementation of the policy');
    expect(captured!.system).toContain('before/after pairs must stay in English');
  });
});

it('GET /api/lesson defaults to the top recurring mistake type', async () => {
  recordErrors(db, ['word_choice', 'noun_plague', 'noun_plague']);
  const utilityProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        principle: 'Use a stronger verb when the noun phrase is doing the work.',
        mindset: 'Start from the action.',
        extraPairs: [
          { before: 'made an implementation of the plan', after: 'implemented the plan' },
          { before: 'made an improvement to the process', after: 'improved the process' },
          { before: 'conducted a review of the memo', after: 'reviewed the memo' },
        ],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/lesson`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.errorType).toBe('noun_plague');
  });
});

it('POST /api/research returns sourced analysis and an evidence-integrated essay', async () => {
  const calls: string[] = [];
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      calls.push(opts.system);
      if (opts.system.includes('argument analyst')) {
        return JSON.stringify({
          analysis: 'The claim is plausible, but it needs current evidence on spending and margins.',
          otherAngles: ['Supplier concentration', 'Depreciation pressure'],
          searchQueries: ['AI capex cloud margins', 'AI chip supply constraints'],
        });
      }
      if (opts.system.includes('one-sentence summaries')) {
        return JSON.stringify({
          sources: [
            {
              title: 'Cloud firms raise AI spending',
              link: 'https://example.com/ai-capex',
              summary: 'Cloud providers are increasing AI infrastructure budgets despite margin concerns.',
            },
            {
              title: 'Chip supply remains tight',
              link: 'https://example.com/chip-supply',
              summary: 'Advanced chip supply remains a bottleneck for AI infrastructure expansion.',
            },
          ],
        });
      }
      return JSON.stringify({
        integratedEssay: 'AI capex may pressure margins in the short term. Evidence from Example Wire shows that cloud providers are increasing AI infrastructure budgets despite margin concerns. That makes the margin risk concrete, while tight chip supply also suggests the spending cycle may remain supply constrained.',
        integrationNotes: [
          {
            insertedAfter: 'AI capex may pressure margins in the short term.',
            what: 'Added current AI infrastructure spending evidence from Example Wire.',
            why: 'It turns a broad claim about margin pressure into a supported evidence point.',
            structurePart: 'evidence',
          },
          {
            insertedAfter: 'spending cycle',
            what: 'Added the chip supply constraint angle.',
            why: 'It broadens the argument beyond demand and valuation.',
            structurePart: 'commentary',
          },
        ],
      });
    },
  };

  await withServer(createApp({
    db,
    utilityProvider,
    newsFetcher: async query => query.includes('chip')
      ? [{ title: 'Chip supply remains tight', link: 'https://example.com/chip-supply', source: 'Example Markets' }]
      : [{ title: 'Cloud firms raise AI spending', link: 'https://example.com/ai-capex', source: 'Example Wire' }],
  }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        essay: 'AI capex may pressure margins in the short term, but it can also deepen cloud moats.',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis).toContain('needs current evidence');
    expect(json.otherAngles).toEqual(['Supplier concentration', 'Depreciation pressure']);
    expect(json.sources).toEqual([
      {
        title: 'Cloud firms raise AI spending',
        link: 'https://example.com/ai-capex',
        summary: 'Cloud providers are increasing AI infrastructure budgets despite margin concerns.',
      },
      {
        title: 'Chip supply remains tight',
        link: 'https://example.com/chip-supply',
        summary: 'Advanced chip supply remains a bottleneck for AI infrastructure expansion.',
      },
    ]);
    expect(json.integratedEssay).toContain('Evidence from Example Wire');
    expect(json.integrationNotes[0]).toEqual(expect.objectContaining({
      structurePart: 'evidence',
      why: expect.stringContaining('supported evidence point'),
    }));
    expect(calls).toHaveLength(3);
  });
});

it('POST /api/research survives news failure with analysis and a structure-only integrated essay', async () => {
  let summaryCalls = 0;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      if (opts.system.includes('argument analyst')) {
        return JSON.stringify({
          analysis: 'The draft has a usable claim but needs a clearer evidence slot.',
          otherAngles: ['Regulation risk'],
          searchQueries: ['AI regulation investment'],
        });
      }
      if (opts.system.includes('one-sentence summaries')) {
        summaryCalls += 1;
      }
      return JSON.stringify({
        integratedEssay: 'AI investment may deepen cloud moats. A stronger version would state the claim first, add an evidence slot, then explain why the evidence changes the conclusion.',
        integrationNotes: [
          {
            insertedAfter: 'AI investment may deepen cloud moats.',
            what: 'Added a structure-only evidence slot because live sources were unavailable.',
            why: 'It shows where evidence should support the claim without inventing a citation.',
            structurePart: 'claim',
          },
        ],
      });
    },
  };

  await withServer(createApp({
    db,
    utilityProvider,
    newsFetcher: async () => {
      throw new Error('offline');
    },
  }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ essay: 'AI investment may deepen cloud moats.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis).toContain('usable claim');
    expect(json.sources).toEqual([]);
    expect(json.integratedEssay).toContain('A stronger version would state the claim first');
    expect(json.integrationNotes[0].what).toContain('structure-only evidence slot');
    expect(summaryCalls).toBe(0);
  });
});

it('POST /api/structure returns an ideal outline and per-part draft observations', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        idealOutline: [
          { part: 'Topic sentence', purpose: 'State the central claim in one clear sentence.' },
          { part: 'Evidence', purpose: 'Use specific facts or examples to support the claim.' },
          { part: 'Commentary', purpose: 'Explain why the evidence changes the reader conclusion.' },
        ],
        observations: [
          { part: 'Topic sentence', status: 'present', note: 'The draft opens with a claim.' },
          { part: 'Evidence', status: 'weak', note: 'The draft gestures at spending but gives no concrete evidence.' },
          { part: 'Commentary', status: 'missing', note: 'The draft needs a sentence explaining the implication.' },
        ],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/structure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: 'AI capex may hurt margins. Companies are spending a lot. Therefore it is risky.',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idealOutline).toEqual([
      { part: 'Topic sentence', purpose: 'State the central claim in one clear sentence.' },
      { part: 'Evidence', purpose: 'Use specific facts or examples to support the claim.' },
      { part: 'Commentary', purpose: 'Explain why the evidence changes the reader conclusion.' },
    ]);
    expect(json.observations).toEqual([
      { part: 'Topic sentence', status: 'present', note: 'The draft opens with a claim.' },
      { part: 'Evidence', status: 'weak', note: 'The draft gestures at spending but gives no concrete evidence.' },
      { part: 'Commentary', status: 'missing', note: 'The draft needs a sentence explaining the implication.' },
    ]);
    expect(captured!.model).toBe('gpt-4o');
    expect(captured!.system).toContain('writing structure coach');
    expect(captured!.user).toContain('AI capex may hurt margins');
  });
});
