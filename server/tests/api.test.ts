import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { config } from '../src/config.js';
import { openDb, migrate } from '../src/db/db.js';
import {
  getPrimeCandidates,
  getMistakeLog,
  getTallies,
  getWritingHistory,
  insertAnnotations,
  insertSession,
  insertVocab,
  recordErrors,
  upsertVocab,
} from '../src/db/dal.js';
import type { LLMProvider } from '../src/brain/provider.js';
import type { EmbeddingProvider } from '../src/brain/embedding.js';

let db: ReturnType<typeof openDb>;
const USER_ID = 'local';

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
});

async function withServer<T>(app: ReturnType<typeof createApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const url = String(input);
    if (url.startsWith(`http://127.0.0.1:${address.port}/api`)) {
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
    expect(getTallies(db, USER_ID)).toEqual([]);
  });
});

it('POST /api/coach passes persistent weaknesses and retrieved snippets to the coach prompt', async () => {
  recordErrors(db, USER_ID, ['noun_plague', 'noun_plague', 'word_choice']);
  db.prepare(`
    INSERT INTO session_embeddings (session_id, user_id, content, embedding)
    VALUES (?, ?, ?, ?)
  `).run(77, USER_ID, 'Past draft about budget allocation and margin pressure.', JSON.stringify([1, 0]));
  let captured: { system: string; user: string; model: string } | undefined;
  const coachProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({ paragraphIndex: 0, annotations: [] });
    },
  };
  const embeddingProvider: EmbeddingProvider = {
    async embed(text) {
      expect(text).toContain('We made a discussion');
      return [1, 0];
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We made a discussion about the budget.' }),
    });

    expect(res.status).toBe(200);
    expect(captured!.system).toContain('Persistent weaknesses to watch: noun_plague, word_choice.');
    expect(captured!.system).toContain('Past writing context [1]: Past draft about budget allocation and margin pressure.');
  });
});

it('POST /api/coach succeeds when memory embedding is disabled', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const coachProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({ paragraphIndex: 0, annotations: [] });
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider: undefined }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'This sentence is natural.' }),
    });

    expect(res.status).toBe(200);
    expect(captured!.system).not.toContain('Past writing context');
  });
});

it('POST /api/coach-history saves each coach diagnosis without overwriting or updating tallies', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    for (const span of ['first vague phrase', 'second vague phrase']) {
      const res = await fetch(`${baseUrl}/api/coach-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2026-06-09',
          promptId: 4,
          paragraphIdx: 0,
          paragraph: `This is the ${span}.`,
          annotations: [{
            span,
            errorType: 'word_choice',
            hint: 'Use a more exact expression.',
            explanation: 'The current phrase is vague.',
            rule: 'Concrete word choice',
            ruleExample: { before: span, after: span.replace('vague', 'specific') },
            modelRewrite: span.replace('vague', 'specific'),
          }],
        }),
      });
      expect(res.status).toBe(201);
    }

    expect(getTallies(db, USER_ID)).toEqual([]);
    expect(getWritingHistory(db, USER_ID, 10)).toEqual([
      expect.objectContaining({
        source: 'coach_review',
        draftText: 'This is the second vague phrase.',
      }),
      expect.objectContaining({
        source: 'coach_review',
        draftText: 'This is the first vague phrase.',
      }),
    ]);
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
    expect(getTallies(db, USER_ID)).toEqual([]);
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
    expect(getTallies(db, USER_ID)).toEqual([
      expect.objectContaining({ errorType: 'noun_plague', count: 1 }),
    ]);
    expect(getMistakeLog(db, USER_ID, 'noun_plague', 1)).toEqual([
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
    expect(getTallies(db, USER_ID)).toEqual([
      expect.objectContaining({ errorType: 'noun_plague', count: 1 }),
    ]);
  });
});

it('POST /api/sentence-lab passes persistent weaknesses and retrieved snippets to the prompt', async () => {
  recordErrors(db, USER_ID, ['noun_plague']);
  db.prepare(`
    INSERT INTO session_embeddings (session_id, user_id, content, embedding)
    VALUES (?, ?, ?, ?)
  `).run(88, USER_ID, 'Past sentence about implementation and budget timing.', JSON.stringify([0, 1]));
  let captured: { system: string; user: string; model: string } | undefined;
  const coachProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({ paragraphIndex: 0, annotations: [], nativeVersion: 'We implemented the policy.' });
    },
  };
  const embeddingProvider: EmbeddingProvider = {
    async embed(text) {
      expect(text).toContain('made the implementation');
      return [0, 1];
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/sentence-lab/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: 'We made the implementation of the policy.' }),
    });

    expect(res.status).toBe(201);
    expect(captured!.system).toContain('Persistent weaknesses to watch: noun_plague.');
    expect(captured!.system).toContain('Past writing context [1]: Past sentence about implementation and budget timing.');
  });
});

it('POST /api/speaking/review saves a speaking review with context, tallies, history, and embedding', async () => {
  recordErrors(db, USER_ID, ['word_choice']);
  let captured: { system: string; user: string; model: string } | undefined;
  const coachProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        nativeVersion: 'I think this article offers a useful perspective on AI agents.',
        takeaways: ['Use "offers a perspective" for what an article does.'],
        annotations: [{
          span: 'has a useful perspective',
          errorType: 'word_choice',
          hint: 'Use a more natural verb for what an article does.',
          explanation: 'Articles usually "offer" a perspective.',
          rule: 'Article as argument, not person',
          ruleExample: {
            before: 'this article has a useful perspective',
            after: 'this article offers a useful perspective',
          },
          modelRewrite: 'offers a useful perspective',
        }],
      });
    },
  };
  let resolveEmbedding: ((value: number[]) => void) | undefined;
  let embedCalls = 0;
  let embeddedContent: string | undefined;
  const embeddingProvider: EmbeddingProvider = {
    embed(text) {
      embedCalls += 1;
      embeddedContent = text;
      return new Promise(resolve => {
        resolveEmbedding = resolve;
      });
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider }), async baseUrl => {
    const responsePromise = fetch(`${baseUrl}/api/speaking/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-06-29',
        transcript: 'I think this article has a useful perspective about AI agents.',
        context: 'Spoken reaction after reading',
        contextLabel: 'reading_reaction',
        contextTitle: 'AI agents move into finance workflows',
        contextUrl: 'https://example.com/ai-agents',
        contextExcerpt: 'Agents are entering finance workflows faster than expected.',
      }),
    });

    const res = await Promise.race([
      responsePromise,
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('response blocked on embedding')), 300)),
    ]);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      id: expect.any(Number),
      transcript: 'I think this article has a useful perspective about AI agents.',
      nativeVersion: 'I think this article offers a useful perspective on AI agents.',
      takeaways: ['Use "offers a perspective" for what an article does.'],
      context: {
        label: 'reading_reaction',
        title: 'AI agents move into finance workflows',
        url: 'https://example.com/ai-agents',
        excerpt: 'Agents are entering finance workflows faster than expected.',
      },
      annotations: [
        expect.objectContaining({
          span: 'has a useful perspective',
          errorType: 'word_choice',
          accepted: true,
          userRewrite: 'offers a useful perspective',
        }),
      ],
    }));
    expect(captured!.user).toContain('Spoken reaction after reading');
    expect(captured!.user).toContain('https://example.com/ai-agents');
    expect(getTallies(db, USER_ID)).toEqual([
      expect.objectContaining({ errorType: 'word_choice', count: 2 }),
    ]);
    expect(getWritingHistory(db, USER_ID, 5)[0]).toEqual(expect.objectContaining({
      source: 'speaking_review',
      finalText: 'I think this article offers a useful perspective on AI agents.',
      context: expect.objectContaining({
        title: 'AI agents move into finance workflows',
      }),
    }));
    expect(embedCalls).toBe(1);
    expect(embeddedContent).toContain('I think this article has a useful perspective');
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_embeddings').get()).toEqual({ count: 0 });

    resolveEmbedding!([0.2, 0.8]);
    await new Promise(resolve => setTimeout(resolve, 0));

    const row = db.prepare('SELECT session_id, user_id, content, embedding FROM session_embeddings').get() as {
      session_id: number;
      user_id: string;
      content: string;
      embedding: string;
    };
    expect(row).toEqual({
      session_id: json.id,
      user_id: USER_ID,
      content: [
        'I think this article has a useful perspective about AI agents.',
        'I think this article offers a useful perspective on AI agents.',
      ].join('\n\n'),
      embedding: JSON.stringify([0.2, 0.8]),
    });
  });
}, 10_000);

it('POST /api/speaking/review trims transcript and accepts cleaned context URLs', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const coachProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        nativeVersion: 'I think this point works.',
        takeaways: [],
        annotations: [],
      });
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider: undefined }), async baseUrl => {
    const trimmed = await fetch(`${baseUrl}/api/speaking/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: '  I think this point works.  ',
        contextLabel: ' reading_reaction ',
        contextTitle: ' AI agents move into finance workflows ',
        contextUrl: '  https://example.com/ai-agents  ',
        contextExcerpt: ' Agents are entering finance workflows faster than expected. ',
      }),
    });

    expect(trimmed.status).toBe(201);
    const trimmedJson = await trimmed.json();
    expect(trimmedJson.transcript).toBe('I think this point works.');
    expect(trimmedJson.context).toEqual({
      label: 'reading_reaction',
      title: 'AI agents move into finance workflows',
      url: 'https://example.com/ai-agents',
      excerpt: 'Agents are entering finance workflows faster than expected.',
    });
    expect(captured!.user).toContain('https://example.com/ai-agents');

    const blankUrl = await fetch(`${baseUrl}/api/speaking/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'A short spoken reflection.',
        contextTitle: ' Source title only ',
        contextUrl: '   ',
      }),
    });

    expect(blankUrl.status).toBe(201);
    const blankUrlJson = await blankUrl.json();
    expect(blankUrlJson.context).toEqual({ title: 'Source title only' });
  });
});

it('POST /api/speaking/review rejects blank transcripts and invalid context URLs', async () => {
  let calls = 0;
  const coachProvider: LLMProvider = {
    async complete() {
      calls += 1;
      return JSON.stringify({
        nativeVersion: 'This should not be reached.',
        takeaways: [],
        annotations: [],
      });
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider: undefined }), async baseUrl => {
    const blankTranscript = await fetch(`${baseUrl}/api/speaking/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: '   ' }),
    });
    expect(blankTranscript.status).toBe(400);

    const invalidUrl = await fetch(`${baseUrl}/api/speaking/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'I have a real thought.',
        contextUrl: 'not a url',
      }),
    });
    expect(invalidUrl.status).toBe(400);

    expect(calls).toBe(0);
  });
});

it('shows every Sentence Lab diagnosis in history immediately and keeps separate same-day rewrites', async () => {
  let calls = 0;
  const coachProvider: LLMProvider = {
    async complete() {
      calls += 1;
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [{
          span: calls === 1 ? 'discussed about' : 'more better',
          errorType: 'small_grammar',
          hint: 'Tighten the grammar.',
          explanation: 'This phrasing is not idiomatic.',
          rule: calls === 1 ? 'Discuss takes a direct object' : 'Avoid double comparatives',
          modelRewrite: calls === 1 ? 'discussed' : 'better',
        }],
        nativeVersion: calls === 1 ? 'We discussed the roadmap.' : 'This option is better.',
      });
    },
  };

  await withServer(createApp({ db, coachProvider }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/sentence-lab/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-06-09',
        sentence: 'We discussed about the roadmap.',
      }),
    });
    const firstDiagnosis = await first.json();

    const second = await fetch(`${baseUrl}/api/sentence-lab/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-06-09',
        sentence: 'This option is more better.',
      }),
    });
    expect(second.status).toBe(201);

    const historyAfterDiagnose = await fetch(`${baseUrl}/api/history`);
    expect(historyAfterDiagnose.status).toBe(200);
    await expect(historyAfterDiagnose.json()).resolves.toMatchObject({
      entries: [
        expect.objectContaining({
          source: 'sentence_lab',
          date: '2026-06-09',
          draftText: 'This option is more better.',
          annotations: [
            expect.objectContaining({ span: 'more better', rule: 'Avoid double comparatives' }),
          ],
        }),
        expect.objectContaining({
          source: 'sentence_lab',
          date: '2026-06-09',
          draftText: 'We discussed about the roadmap.',
          annotations: [
            expect.objectContaining({ span: 'discussed about', rule: 'Discuss takes a direct object' }),
          ],
        }),
      ],
    });

    const result = await fetch(`${baseUrl}/api/sentence-lab/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: firstDiagnosis.id,
        rewrite: 'We discussed the roadmap.',
      }),
    });
    expect(result.status).toBe(200);

    const historyAfterReveal = await fetch(`${baseUrl}/api/history`);
    const historyJson = await historyAfterReveal.json();
    expect(historyJson.entries).toEqual([
      expect.objectContaining({
        source: 'sentence_lab',
        draftText: 'This option is more better.',
      }),
      expect.objectContaining({
        source: 'sentence_lab',
        draftText: 'We discussed about the roadmap.',
        finalText: 'We discussed the roadmap.',
      }),
    ]);
    expect(historyJson.entries[0]).not.toHaveProperty('finalText');
  });
}, 10_000);

it('POST /api/follow-up keeps pre-rewrite answers reveal-safe and allows post-rewrite analysis', async () => {
  const captured: Array<{ system: string; user: string; model: string }> = [];
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured.push(opts);
      return JSON.stringify({
        answer: captured.length === 1
          ? 'This is a noun-plague pattern. Try locating the action first.'
          : 'The native version uses a direct verb, so the sentence feels more active.',
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const pre = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'paragraph',
        mode: 'pre_rewrite',
        question: 'Can you just show me the correct sentence?',
        original: 'We carried out the implementation of the policy.',
        annotations: [{
          span: 'implementation of the policy',
          errorType: 'noun_plague',
          hint: 'Find the action.',
          explanation: 'The action is hidden in a noun.',
          rule: 'Prefer a verb over a noun string',
          ruleExample: { before: 'implementation of the policy', after: 'implemented the policy' },
          modelRewrite: 'implemented the policy',
        }],
        nativeVersion: 'We implemented the policy.',
      }),
    });

    expect(pre.status).toBe(200);
    await expect(pre.json()).resolves.toEqual({
      answer: 'This is a noun-plague pattern. Try locating the action first.',
      mode: 'pre_rewrite',
    });
    expect(captured[0].system).toContain('Do not reveal');
    expect(captured[0].user).not.toContain('We implemented the policy.');
    expect(captured[0].user).not.toContain('implemented the policy');
    expect(captured[0].user).not.toContain('modelRewrite');
    expect(captured[0].user).not.toContain('"after"');

    const post = await fetch(`${baseUrl}/api/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'sentence_lab',
        mode: 'post_rewrite',
        question: 'Why is the native version better?',
        original: 'We carried out the implementation of the policy.',
        rewrite: 'We implemented the policy.',
        nativeVersion: 'We implemented the policy.',
        annotations: [{
          span: 'implementation of the policy',
          errorType: 'noun_plague',
          hint: 'Find the action.',
          explanation: 'The action is hidden in a noun.',
          rule: 'Prefer a verb over a noun string',
          ruleExample: { before: 'implementation of the policy', after: 'implemented the policy' },
          modelRewrite: 'implemented the policy',
        }],
      }),
    });

    expect(post.status).toBe(200);
    await expect(post.json()).resolves.toEqual({
      answer: 'The native version uses a direct verb, so the sentence feels more active.',
      mode: 'post_rewrite',
    });
    expect(captured[1].user).toContain('We implemented the policy.');
    expect(captured[1].user).toContain('modelRewrite');
    expect(captured[1].user).toContain('implemented the policy');
  });
});

it('POST /api/sessions records errors and increments accepted vocab suggestions', async () => {
  insertVocab(db, USER_ID, [
    { word: 'shore up', kind: 'phrase', timesSuggested: 0, timesUsed: 0 },
    { word: 'risk premium', kind: 'phrase', timesSuggested: 2, timesUsed: 0 },
  ]);

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftText: 'We need support margins because the risk premium widened.',
        finalText: 'We need to shore up margins.',
        durationS: 120,
        primedVocab: ['risk premium', 'duration mismatch'],
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
    expect(getTallies(db, USER_ID)).toEqual([
      expect.objectContaining({ errorType: 'redundancy', count: 1 }),
    ]);
    const usageAfterFirst = db.prepare(`
      SELECT normalized, times_used
      FROM vocab
      WHERE user_id = ? AND normalized IN (?, ?)
      ORDER BY normalized
    `).all(USER_ID, 'risk premium', 'shore up') as Array<{ normalized: string; times_used: number }>;
    expect(usageAfterFirst).toEqual([
      { normalized: 'risk premium', times_used: 1 },
      { normalized: 'shore up', times_used: 1 },
    ]);
    expect(json).toEqual(expect.objectContaining({
      vocabUsed: 1,
      vocabTotal: 2,
    }));
    const row = db.prepare(`
      SELECT rule, rule_example
      FROM annotations
      WHERE span_text = ?
    `).get('in order to') as { rule: string; rule_example: string };
    expect(row.rule).toBe('Drop empty category nouns');
    expect(JSON.parse(row.rule_example)).toEqual({ before: 'in order to', after: 'to' });
  });
});

it('POST /api/sessions stores embeddings asynchronously when a provider is present', async () => {
  let resolveEmbedding: ((value: number[]) => void) | undefined;
  let embedCalls = 0;
  const embeddingProvider: EmbeddingProvider = {
    embed(text) {
      embedCalls += 1;
      expect(text).toBe('draft text\n\nfinal text');
      return new Promise(resolve => {
        resolveEmbedding = resolve;
      });
    },
  };

  await withServer(createApp({ db, embeddingProvider }), async baseUrl => {
    const responsePromise = fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftText: 'draft text',
        finalText: 'final text',
      }),
    });

    const res = await Promise.race([
      responsePromise,
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('response blocked on embedding')), 300)),
    ]);
    expect(res.status).toBe(201);
    const json = await res.json() as { id: number };
    expect(embedCalls).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_embeddings').get()).toEqual({ count: 0 });

    resolveEmbedding!([0.25, 0.75]);
    await new Promise(resolve => setTimeout(resolve, 0));

    const row = db.prepare('SELECT session_id, user_id, content, embedding FROM session_embeddings').get() as {
      session_id: number;
      user_id: string;
      content: string;
      embedding: string;
    };
    expect(row).toEqual({
      session_id: json.id,
      user_id: USER_ID,
      content: 'draft text\n\nfinal text',
      embedding: JSON.stringify([0.25, 0.75]),
    });
  });
});

it('POST /api/sessions succeeds when embedding is disabled', async () => {
  await withServer(createApp({ db, embeddingProvider: undefined }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftText: 'draft only' }),
    });

    expect(res.status).toBe(201);
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_embeddings').get()).toEqual({ count: 0 });
  });
});

it('POST /api/paragraph-result records a paragraph rewrite idempotently', async () => {
  insertVocab(db, USER_ID, [{ word: 'shore up', kind: 'phrase', timesSuggested: 0, timesUsed: 0 }]);

  await withServer(createApp({ db }), async baseUrl => {
    const body = {
      date: '2026-06-05',
      promptId: 1,
      paragraphIdx: 0,
      paragraph: 'We need support margins in order to calm investors.',
      rewrite: 'We need to shore up margins to calm investors.',
      nativeText: 'We need to shore up margins to calm investors.',
      elevatedText: 'We need to strengthen margins to reassure investors.',
      evidenceText: 'AI spending may pressure margins. Evidence should show whether that pressure is temporary or structural.',
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
    expect(getWritingHistory(db, USER_ID, 1)[0]).toEqual(expect.objectContaining({
      nativeText: 'We need to shore up margins to calm investors.',
      elevatedText: 'We need to strengthen margins to reassure investors.',
      evidenceText: 'AI spending may pressure margins. Evidence should show whether that pressure is temporary or structural.',
    }));
    expect(getTallies(db, USER_ID)).toEqual([
      expect.objectContaining({ errorType: 'redundancy', count: 1 }),
    ]);
    const usageAfterFirst = db.prepare(`
      SELECT times_used
      FROM vocab
      WHERE user_id = ? AND normalized = ?
    `).get(USER_ID, 'shore up') as { times_used: number };
    expect(usageAfterFirst.times_used).toBe(1);

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
    expect(getTallies(db, USER_ID)).toEqual([]);
    const usageAfterReplacement = db.prepare(`
      SELECT times_used
      FROM vocab
      WHERE user_id = ? AND normalized = ?
    `).get(USER_ID, 'shore up') as { times_used: number };
    expect(usageAfterReplacement.times_used).toBe(1);
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

it('POST /api/paragraph-result graduates vocab words used correctly in rewrite', async () => {
  upsertVocab(db, USER_ID, { word: 'leverage', normalized: 'leverage', kind: 'word', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'moat', normalized: 'moat', kind: 'word', timesSuggested: 0, timesUsed: 0 });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/paragraph-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paragraphIdx: 0,
        paragraph: 'We use every advantage we have.',
        rewrite: 'We leverage every advantage we have.',
        annotations: [],
      }),
    });
    expect(res.status).toBe(201);

    const graduated = await fetch(`${baseUrl}/api/vocab/graduated`);
    expect(graduated.status).toBe(200);
    const json = await graduated.json();
    expect(json.items.map((v: { word: string }) => v.word)).toContain('leverage');
    expect(json.items.map((v: { word: string }) => v.word)).not.toContain('moat');
  });
});

it('POST /api/vocab/save upserts and GET /api/vocab/prime returns LLM-selected topic-fit candidates', async () => {
  upsertVocab(db, USER_ID, { word: 'plain', kind: 'word', captureCount: 1, timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'overused', kind: 'word', captureCount: 9, timesSuggested: 0, timesUsed: 12 });
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

    const saved = getPrimeCandidates(db, USER_ID, 1)[0];
    expect(saved.normalized).toBe('risk premium');
    expect(saved.timesSuggested).toBe(1);
  });
});

it('GET /api/vocab/list returns latest-first vocab with total count', async () => {
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
      expect.objectContaining({
        id: expect.any(Number),
        word: 'fresh word',
        kind: 'word',
        defCn: 'newly captured',
        captureCount: 1,
        timesSuggested: 0,
        timesUsed: 0,
        lastCaptured: '2026-06-04T00:00:00.000Z',
        capturedDate: '2026-06-04',
      }),
    ]);
  });
});

it('GET /api/vocab/review-queue returns all unscheduled words (SM-2: due today or no next_review_at)', async () => {
  upsertVocab(db, USER_ID, { word: 'easy word', ease: 'easy', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'hard word', ease: 'hard', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'new word', ease: 'new', timesSuggested: 0, timesUsed: 0 });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/review-queue`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.map((item: { word: string }) => item.word)).toEqual(
      expect.arrayContaining(['new word', 'hard word', 'easy word']),
    );
    expect(json.items).toHaveLength(3);
  });
});

it('POST /api/vocab/:id/review updates own word and returns 404 for another user word', async () => {
  const ownId = upsertVocab(db, USER_ID, { word: 'own word', timesSuggested: 0, timesUsed: 0 });
  const otherId = upsertVocab(db, 'other-user', { word: 'other word', timesSuggested: 0, timesUsed: 0 });

  await withServer(createApp({ db }), async baseUrl => {
    const own = await fetch(`${baseUrl}/api/vocab/${ownId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ease: 'easy' }),
    });
    const other = await fetch(`${baseUrl}/api/vocab/${otherId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ease: 'hard' }),
    });

    expect(own.status).toBe(204);
    expect(other.status).toBe(404);
    const ownRow = db.prepare('SELECT ease, last_reviewed FROM vocab WHERE id = ?').get(ownId) as {
      ease: string;
      last_reviewed: string | null;
    };
    expect(ownRow.ease).toBe('easy');
    expect(ownRow.last_reviewed).toEqual(expect.any(String));
  });
});

it('GET /api/vocab/:id/deep-dive generates on miss, caches, and includes related words', async () => {
  const id = upsertVocab(db, USER_ID, {
    word: 'allocate',
    examples: [
      'The team allocated more capital to infrastructure.',
      'A careful allocation can protect runway.',
    ],
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, { word: 'allocation', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'assign', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, 'other-user', { word: 'allocated', timesSuggested: 0, timesUsed: 0 });
  let calls = 0;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      calls += 1;
      expect(opts.user).toBe('Word: allocate');
      return JSON.stringify({
        wordFamily: ['allocate', 'allocated', 'allocation'],
        nearSynonyms: [{ word: 'assign', distinction: 'Use assign for tasks or ownership.' }],
        usageExamples: [
          'The team allocated more capital to infrastructure.',
          'A careful allocation can protect runway.',
          'Capital was allocated before the forecast changed.',
        ],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/vocab/${id}/deep-dive`);
    const second = await fetch(`${baseUrl}/api/vocab/${id}/deep-dive`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(calls).toBe(1);
    expect(firstJson.wordFamily).toEqual(['allocate', 'allocated', 'allocation']);
    expect(firstJson.nearSynonyms).toEqual([{ word: 'assign', distinction: 'Use assign for tasks or ownership.' }]);
    expect(firstJson.relatedInYourList).toEqual(expect.arrayContaining(['allocation', 'assign']));
    expect(firstJson.relatedInYourList).not.toContain('allocated');
    expect(secondJson.wordFamily).toEqual(firstJson.wordFamily);
    expect(secondJson.relatedInYourList).toEqual(expect.arrayContaining(['allocation', 'assign']));
  });
});

it('GET /api/vocab/today returns only today captures', async () => {
  upsertVocab(db, USER_ID, { word: 'today word', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, {
    word: 'old word',
    lastCaptured: '2000-01-01T00:00:00.000Z',
    timesSuggested: 0,
    timesUsed: 0,
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/today`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.map((item: { word: string }) => item.word)).toEqual(['today word']);
  });
});

it('GET /api/memory/profile returns weakness, session, embedding, and vocab summaries', async () => {
  recordErrors(db, USER_ID, ['noun_plague', 'noun_plague', 'word_choice']);
  insertSession(db, USER_ID, { draftText: 'draft', finalText: 'final' });
  db.prepare(`
    INSERT INTO session_embeddings (session_id, user_id, content, embedding)
    VALUES (?, ?, ?, ?)
  `).run(1, USER_ID, 'draft final', JSON.stringify([1, 0]));
  upsertVocab(db, USER_ID, { word: 'fresh', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'again', ease: 'hard', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'known', ease: 'easy', timesSuggested: 0, timesUsed: 0 });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/memory/profile`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
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
});

it('POST /api/vocab/save returns existed true and incremented captureCount for an existing normalized term', async () => {
  upsertVocab(db, USER_ID, {
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
    expect(json).toEqual(expect.objectContaining({
      id: expect.any(Number),
      captureCount: 2,
      previousCaptureCount: 1,
      captureDelta: 1,
      existed: true,
      canonicalWord: 'risk premium',
      normalized: 'risk premium',
      baseForm: 'risk premium',
    }));
    expect(getPrimeCandidates(db, USER_ID, 1)[0].captureCount).toBe(2);
  });
});

it('POST /api/vocab/save logs one new encounter even if the client sends an old total', async () => {
  upsertVocab(db, USER_ID, {
    word: 'Risk premium',
    kind: 'phrase',
    captureCount: 4,
    timesSuggested: 0,
    timesUsed: 0,
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: 'risk premium',
        kind: 'phrase',
        captureCount: 4,
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      captureCount: 5,
      previousCaptureCount: 4,
      captureDelta: 1,
      existed: true,
    }));
    expect(getPrimeCandidates(db, USER_ID, 1)[0].captureCount).toBe(5);
  });
});

it('GET /api/vocab/all website source includes shared extension captures from the Rubi profile', async () => {
  upsertVocab(db, 'rubi', {
    word: 'browser sourced phrase',
    kind: 'phrase',
    source: 'website_reading',
    sourceTitle: 'Browser page',
    sourceUrl: 'https://example.com/browser-page',
    timesSuggested: 0,
    timesUsed: 0,
  });
  upsertVocab(db, USER_ID, {
    word: 'plain local phrase',
    kind: 'phrase',
    source: 'capture',
    timesSuggested: 0,
    timesUsed: 0,
  });

  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/all?offset=0&limit=50&sort=date&source=website_reading`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(1);
    expect(json.items).toEqual([
      expect.objectContaining({
        word: 'browser sourced phrase',
        source: 'website_reading',
        sourceTitle: 'Browser page',
        sourceUrl: 'https://example.com/browser-page',
      }),
    ]);
  });
});

it('POST /api/vocab/save deduplicates singular and plural captures by base form', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: 'fortunes',
        normalized: 'fortunes',
        baseForm: 'fortune',
        kind: 'word',
      }),
    });
    const second = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: 'fortune',
        normalized: 'fortune',
        baseForm: 'fortune',
        kind: 'word',
      }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstJson = await first.json();
    await expect(second.json()).resolves.toEqual(expect.objectContaining({
      id: firstJson.id,
      captureCount: 2,
      existed: true,
      canonicalWord: 'fortune',
      normalized: 'fortune',
      baseForm: 'fortune',
    }));
    const rows = db.prepare(`
      SELECT word, normalized, base_form, capture_count
      FROM vocab
      WHERE user_id = ?
      ORDER BY id
    `).all(USER_ID);
    expect(rows).toEqual([
      {
        word: 'fortune',
        normalized: 'fortune',
        base_form: 'fortune',
        capture_count: 2,
      },
    ]);
  });
});

it('POST /api/vocab/save deduplicates inflected verb captures by base form', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'run', normalized: 'run', baseForm: 'run', kind: 'word' }),
    });
    const second = await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: 'running', normalized: 'running', baseForm: 'run', kind: 'word' }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstJson = await first.json();
    await expect(second.json()).resolves.toEqual(expect.objectContaining({
      id: firstJson.id,
      captureCount: 2,
      existed: true,
      canonicalWord: 'run',
      normalized: 'run',
      baseForm: 'run',
    }));
    expect(db.prepare('SELECT COUNT(*) AS count FROM vocab WHERE user_id = ?').get(USER_ID)).toEqual({ count: 1 });
  });
});

it('POST /api/vocab/merge-families merges related vocab rows and is idempotent', async () => {
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

  await withServer(createApp({ db }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/vocab/merge-families`, { method: 'POST' });
    const second = await fetch(`${baseUrl}/api/vocab/merge-families`, { method: 'POST' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ merged: 1 });
    await expect(second.json()).resolves.toEqual({ merged: 0 });
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
  });
});

it('POST /api/vocab/from-chinese translates a Chinese expression and saves it to vocab', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        word: 'margin pressure',
        normalized: 'margin pressure',
        kind: 'collocation',
        defCn: '利润率压力',
        contextSentence: 'AI infrastructure spending may create margin pressure.',
        examples: ['Investors are watching margin pressure from AI capex.'],
        collocations: ['near-term margin pressure'],
        register: 'finance',
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/vocab/from-chinese`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '利润率压力',
        contextSentence: '想说 AI capex 会带来利润率压力',
      }),
    });
    const duplicate = await fetch(`${baseUrl}/api/vocab/from-chinese`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ' 利润率压力 ' }),
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(201);
    const firstJson = await first.json();
    const duplicateJson = await duplicate.json();
    expect(firstJson).toEqual(expect.objectContaining({
      existed: false,
      captureCount: 1,
      vocab: expect.objectContaining({
        word: 'margin pressure',
        kind: 'collocation',
        defCn: '利润率压力',
        source: 'chinese_input',
      }),
    }));
    expect(duplicateJson).toEqual(expect.objectContaining({
      existed: true,
      captureCount: 2,
    }));
    expect(getPrimeCandidates(db, USER_ID, 1)[0]).toEqual(expect.objectContaining({
      word: 'margin pressure',
      captureCount: 2,
    }));
    expect(captured!.system).toContain('Chinese expression');
    expect(captured!.user).toContain('利润率压力');
  });
});

it('POST /api/vocab/from-chinese tolerates a non-string normalized from the model', async () => {
  // gpt-4o reads the prompt's `normalized?` notation as a yes/no flag and returns
  // a boolean for the Chinese-translation path, which used to 400 the whole capture.
  const utilityProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        word: 'rat race',
        normalized: false,
        kind: 'phrase',
        defCn: '内卷',
        examples: ['She is tired of the corporate rat race.'],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/from-chinese`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '内卷' }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual(expect.objectContaining({
      existed: false,
      vocab: expect.objectContaining({
        word: 'rat race',
        normalized: 'rat race',
        source: 'chinese_input',
      }),
    }));
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
    expect(getPrimeCandidates(db, USER_ID, 1)).toEqual([]);
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
    expect(getPrimeCandidates(db, USER_ID, 1)[0].word).toBe('esoteric');
  });
});

it('GET /api/prompt/today generates a fresh news-grounded prompt through the utility model', async () => {
  recordErrors(db, USER_ID, ['noun_plague', 'calque']);
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
    newsFetcher: async () => [],
  }), async baseUrl => {
    const first = await fetch(`${baseUrl}/api/prompt/today`);
    const second = await fetch(`${baseUrl}/api/prompt/today`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(firstJson.text).toContain('angle 1');
    expect(secondJson.text).toContain('angle 2');
    expect(firstJson.id).toEqual(expect.any(Number));
    expect(firstJson.saved).toBe(false);
    expect(calls).toBe(2);
    expect(captured!.user).toContain('Humanoid robots enter warehouses');
    expect(captured!.user).toContain('angle 1');
    expect(captured!.system).toContain('noun_plague');
    expect(captured!.system).toContain('calque');

    const save = await fetch(`${baseUrl}/api/prompt/${firstJson.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved: true }),
    });
    expect(save.status).toBe(200);
    await expect(save.json()).resolves.toEqual(expect.objectContaining({
      id: firstJson.id,
      saved: true,
    }));

    const savedLibrary = await fetch(`${baseUrl}/api/prompt/library?saved=true&limit=10`);
    expect(savedLibrary.status).toBe(200);
    const savedJson = await savedLibrary.json();
    expect(savedJson.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstJson.id, text: firstJson.text, saved: true }),
    ]));

    const use = await fetch(`${baseUrl}/api/prompt/${firstJson.id}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(use.status).toBe(200);
    await expect(use.json()).resolves.toEqual(expect.objectContaining({
      id: firstJson.id,
      lastUsedAt: expect.any(String),
    }));
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
    newsFetcher: async () => [],
  }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/prompt/today`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.date).toEqual(expect.any(String));
    expect(json.id).toEqual(expect.any(Number));
    expect(json.text).toContain('?');
  });
});

it('GET /api/prompt/today attaches essay prompt and verbatim source quotes', async () => {
  const articleText = 'Regulators warned that the rollout was rushed. Adoption doubled in a year despite the risks.';
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      if (opts.system.includes('extract short, quotable sentences')) {
        return JSON.stringify({
          quotes: [
            { quote: 'Adoption doubled in a year despite the risks.', source: 'The Verge', link: 'https://example.com/a' },
            { quote: 'A sentence that was never published anywhere.', source: 'Fake', link: 'https://example.com/z' },
          ],
        });
      }
      return JSON.stringify({
        theme: 'consumer technology',
        text: 'Do you agree fast tech rollouts do more good than harm? Argue one side.',
        essayPrompt: 'Some argue rapid product rollouts benefit consumers while others warn they externalize risk. Take a clear stance, support it with reasons and evidence, and rebut the strongest counterargument.',
      });
    },
  };

  await withServer(createApp({
    db,
    utilityProvider,
    headlineFetcher: async () => ['Rollout under scrutiny'],
    newsFetcher: async () => [{ title: 'Rollout under scrutiny', link: 'https://example.com/a', source: 'The Verge' }],
    articleFetcher: async () => articleText,
  }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/prompt/today`);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.essayPrompt).toContain('counterargument');
    expect(json.sourceQuotes).toHaveLength(1);
    expect(json.sourceQuotes[0].quote).toContain('Adoption doubled in a year');
    expect(json.sourceQuotes[0].source).toBe('The Verge');

    // The essay prompt and quotes must survive a round-trip through the prompt library.
    const library = await fetch(`${baseUrl}/api/prompt/library?limit=5`);
    const libraryJson = await library.json();
    const stored = libraryJson.prompts.find((p: { id: number }) => p.id === json.id);
    expect(stored.essayPrompt).toContain('counterargument');
    expect(stored.sourceQuotes[0].quote).toContain('Adoption doubled in a year');
  });
});

it('POST /api/flow/analyze returns line-by-line coaching seeded with the user vocab', async () => {
  upsertVocab(db, USER_ID, { word: 'entrenched', normalized: 'entrenched', kind: 'word', timesSuggested: 0, timesUsed: 0 });
  upsertVocab(db, USER_ID, { word: 'as a result', normalized: 'as a result', kind: 'collocation', timesSuggested: 0, timesUsed: 0 });

  let captured: { system: string; user: string } | undefined;
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        lines: [
          {
            original: 'I read a lot.',
            pieces: ['I read a lot'],
            rewrite: 'I read widely.',
            linkToPrevious: null,
            tenseNote: null,
            changes: [],
            drill: {
              prompt: 'Link: "The plan slipped. The launch moved." with a cause connective.',
              targetSkill: 'cause-effect connective',
              vocabUsed: ['as a result'],
              modelAnswer: 'The plan slipped; as a result, the launch moved.',
            },
          },
        ],
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/flow/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: 'I read a lot. My writing is weak.', context: 'reflection' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lines).toHaveLength(1);
    expect(json.lines[0].drill.targetSkill).toBe('cause-effect connective');
    // The saved vocab is offered to the model as drill seeds.
    expect(captured!.user).toContain('as a result');
    expect(captured!.user).toContain('entrenched');
  });
});

it('POST /api/flow/analyze rejects a too-short draft', async () => {
  await withServer(createApp({ db }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/flow/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: 'too short' }),
    });
    expect(res.status).toBe(400);
  });
});

it('POST /api/flow/drill/check grades a write-your-own attempt', async () => {
  const utilityProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        correct: true,
        feedback: 'Good concession with "even though" and consistent present tense.',
        modelAnswer: 'Even though I study daily, I still forget words.',
      });
    },
  };

  await withServer(createApp({ db, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/flow/drill/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drillPrompt: 'Link two ideas with a concession.',
        targetSkill: 'concession + present tense',
        attempt: 'Even though I study daily, I forget words.',
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.correct).toBe(true);
    expect(json.modelAnswer).toContain('Even though');
  });
});

it('GET /api/profile returns error tallies, ranking, and activation stats', async () => {
  const sessionId = insertSession(db, USER_ID, { date: '2026-06-05', draftText: 'draft' });
  insertAnnotations(db, USER_ID, sessionId, [
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
  recordErrors(db, USER_ID, ['noun_plague', 'noun_plague', 'redundancy']);
  upsertVocab(db, USER_ID, {
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
  // Dates relative to today so sessions stay within the rolling 30-day window.
  const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const dayA = daysAgoIso(6);
  const dayB = daysAgoIso(5);
  const first = insertSession(db, USER_ID, { date: dayA, draftText: 'first' });
  const second = insertSession(db, USER_ID, { date: dayB, draftText: 'second' });
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
      { date: dayA, count: 2 },
      { date: dayB, count: 2 },
    ]);
    expect(json.trend).toEqual([
      {
        errorType: 'redundancy',
        points: [
          { date: dayA, count: 1 },
          { date: dayB, count: 1 },
        ],
      },
      {
        errorType: 'calque',
        points: [
          { date: dayB, count: 1 },
        ],
      },
    ]);
  });
});

it('GET /api/mistakes returns a drill-down log optionally filtered by type', async () => {
  const older = insertSession(db, USER_ID, { date: '2026-06-01', draftText: 'older' });
  const newer = insertSession(db, USER_ID, { date: '2026-06-05', draftText: 'newer' });
  insertAnnotations(db, USER_ID, older, [
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
  insertAnnotations(db, USER_ID, newer, [
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
  const sessionId = insertSession(db, USER_ID, { date: '2026-06-05', draftText: 'draft' });
  insertAnnotations(db, USER_ID, sessionId, [
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
  recordErrors(db, USER_ID, ['noun_plague']);
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
    expect(captured!.model).toBe(config.modelUtility);
    expect(captured!.user).toContain('implementation of the policy');
    expect(captured!.system).toContain('before/after pairs must stay in English');
  });
});

it('GET /api/lesson defaults to the top recurring mistake type', async () => {
  recordErrors(db, USER_ID, ['word_choice', 'noun_plague', 'noun_plague']);
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
    expect(captured!.model).toBe(config.modelUtility);
    expect(captured!.system).toContain('writing structure coach');
    expect(captured!.user).toContain('AI capex may hurt margins');
  });
});

it('POST /api/coach attaches elevatedVersion and elevationNotes when elevation succeeds', async () => {
  let utilityCallCount = 0;
  const coachProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [],
        nativeVersion: 'We implemented the policy.',
      });
    },
  };
  const utilityProvider: LLMProvider = {
    async complete(opts) {
      utilityCallCount += 1;
      expect(opts.system).toContain('senior editor');
      expect(opts.user).toContain('We implemented the policy.');
      return JSON.stringify({
        elevatedVersion: 'The policy was implemented swiftly, closing the enforcement gap.',
        elevationNotes: 'Added a specific consequence to deepen the argument.',
      });
    },
  };

  await withServer(createApp({ db, coachProvider, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We carried out the implementation of the policy.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nativeVersion).toBe('We implemented the policy.');
    expect(json.elevatedVersion).toBe('The policy was implemented swiftly, closing the enforcement gap.');
    expect(json.elevationNotes).toBe('Added a specific consequence to deepen the argument.');
    expect(utilityCallCount).toBe(1);
  });
});

it('POST /api/coach returns 200 without elevatedVersion when the elevation LLM call throws', async () => {
  const coachProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [],
        nativeVersion: 'We implemented the policy.',
      });
    },
  };
  const utilityProvider: LLMProvider = {
    async complete() {
      throw new Error('LLM unavailable');
    },
  };

  await withServer(createApp({ db, coachProvider, utilityProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We carried out the implementation of the policy.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nativeVersion).toBe('We implemented the policy.');
    expect(json.elevatedVersion).toBeUndefined();
    expect(json.elevationNotes).toBeUndefined();
  });
});
