# Coach Vocab-Suggest + V2.2 Writing Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nuanced word/chunk suggestions to the writing coach (with inline "Know this?" save-to-vocab), smarter shorter prompts, real news headlines alongside the prompt, TodayStrip click-to-reveal definitions, and a Sentence Patterns reference tab.

**Architecture:** Five independent workstreams sharing one branch (`codex/idiomate-coach-vocab-v2.2` from `codex/idiomate-sentence-lab-v1.4`). Server-side changes flow from `shared/types.ts` → `schema.ts` → `prompts.ts` → routes → client components. The vocab quick-capture route reuses the existing `enrichWord` + `upsertVocabWithResult` pipeline.

**Tech Stack:** Node/Express (server), React/TypeScript (client), better-sqlite3, zod, OpenAI gpt-4o, Google News RSS (already wired), vitest + @testing-library/react.

---

## File map

| File | Change |
|------|--------|
| `shared/types.ts` | Add `distinction?` to `Annotation`; add `newsItems?` to `Prompt` |
| `server/src/brain/schema.ts` | Add `distinction` to `annotationZ` |
| `server/src/brain/prompts.ts` | Update `assembleCoachPrompt` system prompt; update `assembleNewsPrompt` system prompt |
| `server/src/routes/vocab.ts` | Add `POST /api/vocab/capture-save` route |
| `server/src/routes/prompts.ts` | Include `newsItems` from `fetchNews()` in `/today` response |
| `client/src/components/CoachPanel.tsx` | Render vocab_suggestion cards with distinction + inline save buttons |
| `client/src/api.ts` | Add `captureAndSaveVocab()` function |
| `client/src/components/DailyPrompt.tsx` | Show "For context" news section |
| `client/src/components/TodayStrip.tsx` | Click chip → reveal defCn + pos |
| `client/src/components/SentencePatterns.tsx` | New: 8 sentence pattern cards with colour-coded parts |
| `client/src/App.tsx` | Add `'patterns'` tab, import SentencePatterns |
| `client/src/styles.css` | Add `.part-*` colour classes |
| `server/tests/api.test.ts` | Tests: capture-save route, news in prompt, distinction in coach |
| `client/tests/coachPanel.test.tsx` | Tests: vocab_suggestion card, save interaction |
| `client/tests/dailyPrompt.test.tsx` | Tests: news items section |
| `client/tests/todayStrip.test.tsx` | Tests: click-to-reveal |
| `client/tests/sentencePatterns.test.tsx` | Tests: all 8 patterns, colour classes, tab |

---

## Task 1 — Shared types: `distinction` on Annotation + `newsItems` on Prompt

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add fields**

In `shared/types.ts`, update `Annotation`:
```ts
export interface Annotation {
  span: string;
  errorType: ErrorType;
  hint: string;
  explanation: string;
  rule?: string;
  ruleExample?: { before: string; after: string };
  bookReference?: BookReference;
  modelRewrite: string;
  vocabWord?: string;
  distinction?: string;   // ← ADD: nuanced comparison for vocab_suggestion
}
```

Update `Prompt`:
```ts
export interface Prompt {
  id?: number;
  date: string;
  theme: string;
  text: string;
  newsItems?: NewsItem[];   // ← ADD
}
```

- [ ] **Step 2: Run full test suite — expect 151 passing (types only, no logic change)**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: `151 passed`

- [ ] **Step 3: Commit**

```
git add shared/types.ts
git commit -m "types: add distinction to Annotation, newsItems to Prompt"
```

---

## Task 2 — Schema: add `distinction` to `annotationZ`

**Files:**
- Modify: `server/src/brain/schema.ts`

- [ ] **Step 1: Add field to schema**

In `annotationZ`, add after `vocabWord`:
```ts
export const annotationZ = z.object({
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES).catch('small_grammar'),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  rule: z.string().min(1).optional(),
  ruleExample: ruleExampleZ.optional(),
  modelRewrite: z.string(),
  vocabWord: z.string().optional(),
  distinction: z.string().optional(),   // ← ADD
});
```

- [ ] **Step 2: Run tests**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: `151 passed`

- [ ] **Step 3: Commit**

```
git add server/src/brain/schema.ts
git commit -m "schema: add distinction field to annotationZ"
```

---

## Task 3 — Server: `POST /api/vocab/capture-save` (enrich + save in one shot)

**Files:**
- Modify: `server/src/routes/vocab.ts`

- [ ] **Step 1: Write the failing test**

In `server/tests/api.test.ts`, add after the existing capture tests:

```ts
it('POST /api/vocab/capture-save enriches and saves a word in one request', async () => {
  const llm = new StubLLMProvider([
    JSON.stringify({
      word: 'allocate',
      normalized: 'allocate',
      kind: 'word',
      ipa: '/ˈæl.ə.keɪt/',
      defCn: '分配',
      pos: 'verb',
      contextSentence: 'We need to allocate resources carefully.',
      examples: ['Allocate budget early.'],
      collocations: ['allocate resources'],
      register: 'formal',
      baseForm: 'allocate',
    }),
  ]);
  const db = migrate(openDb(':memory:'));
  await withServer(createApp({ db, llm }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/capture-save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ word: 'allocate', contextSentence: 'We need to allocate resources.' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: number; captureCount: number; existed: boolean; vocab: { word: string } };
    expect(body.id).toBeGreaterThan(0);
    expect(body.captureCount).toBe(1);
    expect(body.existed).toBe(false);
    expect(body.vocab.word).toBe('allocate');

    // second call → existed: true, captureCount incremented
    const res2 = await fetch(`${baseUrl}/api/vocab/capture-save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ word: 'allocating', contextSentence: 'She is allocating funds.' }),
    });
    const body2 = await res2.json() as { existed: boolean; captureCount: number };
    expect(body2.existed).toBe(true);
    expect(body2.captureCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run server/tests/api.test.ts
```

Expected: test fails with 404 or similar.

- [ ] **Step 3: Add the route**

In `server/src/routes/vocab.ts`, add after the existing `/chinese` route (around line 170, before `/owner-import`):

```ts
router.post('/capture-save', async (req, res, next) => {
  try {
    const body = captureVocabZ.parse(req.body);
    const enriched = await enrichWord(deps.llm, {
      word: body.word,
      contextSentence: body.contextSentence,
      model: config.modelUtility,
    });
    const result = upsertVocabWithResult(deps.db, req.userId, enriched);
    const saved = { ...enriched, id: result.id, captureCount: result.captureCount };
    res.status(result.existed ? 200 : 201).json({
      id: result.id,
      captureCount: result.captureCount,
      existed: result.existed,
      vocab: saved,
    });
  } catch (err) {
    next(err);
  }
});
```

Import `upsertVocabWithResult` (add to the existing import from `../db/dal.js`):
```ts
import {
  // ... existing imports ...
  upsertVocabWithResult,
} from '../db/dal.js';
```

- [ ] **Step 4: Run — expect PASS**

```
cd D:\dev\idiomate && npx vitest run server/tests/api.test.ts
```

Expected: all server api tests pass.

- [ ] **Step 5: Full suite**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: `152 passed` (one new test).

- [ ] **Step 6: Commit**

```
git add server/src/routes/vocab.ts server/tests/api.test.ts
git commit -m "feat: POST /api/vocab/capture-save — enrich and upsert in one request"
```

---

## Task 4 — Coach system prompt: richer vocab/chunk suggestions with `distinction`

**Files:**
- Modify: `server/src/brain/prompts.ts`

- [ ] **Step 1: Write failing test**

In `server/tests/api.test.ts`, add:

```ts
it('POST /api/coach returns distinction field on vocab_suggestion annotations', async () => {
  const llm = new StubLLMProvider([
    JSON.stringify({
      paragraphIndex: 0,
      nativeVersion: 'We need to assign resources more carefully.',
      annotations: [{
        span: 'give out',
        errorType: 'vocab_suggestion',
        hint: 'A more precise verb exists for this context.',
        explanation: 'Native writers use a domain-specific verb here.',
        rule: 'Prefer precise over generic',
        ruleExample: { before: 'give out resources', after: 'allocate resources' },
        modelRewrite: 'allocate',
        vocabWord: 'allocate',
        distinction: 'give out is generic and informal; allocate is the standard professional term for distributing resources with intention — it implies planning and authority.',
      }],
    }),
  ]);
  const db = migrate(openDb(':memory:'));
  await withServer(createApp({ db, llm }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': USER_ID },
      body: JSON.stringify({ paragraph: 'We give out resources', paragraphIndex: 0 }),
    });
    const body = await res.json() as { annotations: Array<{ vocabWord?: string; distinction?: string }> };
    expect(body.annotations[0].vocabWord).toBe('allocate');
    expect(body.annotations[0].distinction).toBe(
      'give out is generic and informal; allocate is the standard professional term for distributing resources with intention — it implies planning and authority.'
    );
  });
});
```

- [ ] **Step 2: Run — confirm it passes** (StubLLM passes the JSON through, schema must accept `distinction`)

```
cd D:\dev\idiomate && npx vitest run server/tests/api.test.ts
```

Expected: passes (schema already accepts it after Task 2).

- [ ] **Step 3: Update `assembleCoachPrompt` system prompt**

In `server/src/brain/prompts.ts`, update the system string inside `assembleCoachPrompt()`:

Replace the two lines:
```ts
'Use vocab_suggestion only for optional vocabulary opportunities. Suggest, never force.',
'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?}]}.',
```

With:
```ts
'Use vocab_suggestion in two situations: (1) the word or chunk is a calque or direct translation that sounds unnatural — suggest the natural English equivalent; (2) the word or chunk already works but a more idiomatic, native, or domain-specific alternative would elevate the writing — suggest it as an upgrade. For every vocab_suggestion, set vocabWord to the suggested word and add a distinction field: one or two sentences explaining what is wrong or limited about the original AND why the alternative is more natural, precise, or native — include register, domain, or connotation differences. Suggest, never force.',
'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?,distinction?}]}.',
```

- [ ] **Step 4: Run full suite**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: all tests pass (≥ 152).

- [ ] **Step 5: Commit**

```
git add server/src/brain/prompts.ts server/tests/api.test.ts
git commit -m "feat: coach returns distinction on vocab_suggestion — calque and upgrade cases"
```

---

## Task 5 — Client: `captureAndSaveVocab` API function

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: Add function**

In `client/src/api.ts`, add before the last export:

```ts
export interface CaptureAndSaveResponse {
  id: number;
  captureCount: number;
  existed: boolean;
  vocab: Vocab;
}

export function captureAndSaveVocab(
  word: string,
  contextSentence?: string,
): Promise<CaptureAndSaveResponse> {
  return postJson<CaptureAndSaveResponse>('/api/vocab/capture-save', {
    word,
    contextSentence,
  });
}
```

- [ ] **Step 2: Run tests**

```
cd D:\dev\idiomate && npx vitest run client/tests/api.test.ts
```

Expected: passes.

- [ ] **Step 3: Commit**

```
git add client/src/api.ts
git commit -m "feat: add captureAndSaveVocab() client API call"
```

---

## Task 6 — CoachPanel: vocab_suggestion card with inline "Know this?" buttons

**Files:**
- Modify: `client/src/components/CoachPanel.tsx`
- Modify: `client/tests/coachPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

In `client/tests/coachPanel.test.tsx`, add a new `it` block:

```ts
it('shows distinction and save button on vocab_suggestion annotation; saves on "New to me"', async () => {
  let capturedWord = '';
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/vocab/capture-save')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { word: string };
      capturedWord = body.word;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 99, captureCount: 1, existed: false, vocab: { word: body.word } }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  const annotation: import('../../../shared/types').Annotation = {
    span: 'give out',
    errorType: 'vocab_suggestion',
    hint: 'A more precise verb exists.',
    explanation: 'Native writers use allocate here.',
    modelRewrite: 'allocate',
    vocabWord: 'allocate',
    distinction: 'give out is generic; allocate implies intentional distribution with planning and authority.',
  };

  render(
    <CoachPanel
      paragraph="We give out resources."
      annotations={[annotation]}
      onSubmit={() => {}}
    />
  );

  // distinction text visible
  expect(await screen.findByText(/give out is generic/)).toBeInTheDocument();

  // "Know this?" prompt visible
  expect(screen.getByText('allocate')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'I know it' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New to me — save' })).toBeInTheDocument();

  // click save
  fireEvent.click(screen.getByRole('button', { name: 'New to me — save' }));

  await waitFor(() => {
    expect(capturedWord).toBe('allocate');
  });

  // buttons replaced by confirmation
  expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New to me — save' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run client/tests/coachPanel.test.tsx
```

Expected: fails (buttons not yet rendered).

- [ ] **Step 3: Add VocabSuggestCard sub-component inside CoachPanel.tsx**

At the top of `client/src/components/CoachPanel.tsx`, add after imports:

```ts
import { captureAndSaveVocab } from '../api';

type SaveState = 'idle' | 'saving' | 'saved' | 'known';

function VocabSuggestCard({ annotation }: { annotation: Annotation }) {
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const handleSave = async () => {
    if (!annotation.vocabWord) return;
    setSaveState('saving');
    try {
      await captureAndSaveVocab(annotation.vocabWord, annotation.span);
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3 space-y-2">
      {annotation.distinction ? (
        <p className="text-sm leading-6 text-slate-700">{annotation.distinction}</p>
      ) : null}
      {annotation.vocabWord ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{annotation.vocabWord}</span>
          {saveState === 'idle' ? (
            <>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setSaveState('known')}
              >
                I know it
              </button>
              <button
                type="button"
                className="btn-primary text-xs py-1 px-3"
                onClick={() => void handleSave()}
              >
                New to me — save
              </button>
            </>
          ) : saveState === 'saving' ? (
            <span className="text-xs text-slate-400">Saving…</span>
          ) : saveState === 'saved' ? (
            <span className="text-xs text-emerald-600">✓ Saved to your words</span>
          ) : (
            <span className="text-xs text-slate-400">Got it</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

Then inside the annotation map in the `return` of CoachPanel, after `{annotation.ruleExample ? ... : null}`, add:

```tsx
{annotation.errorType === 'vocab_suggestion' ? (
  <VocabSuggestCard annotation={annotation} />
) : null}
```

- [ ] **Step 4: Run — expect PASS**

```
cd D:\dev\idiomate && npx vitest run client/tests/coachPanel.test.tsx
```

Expected: all coachPanel tests pass.

- [ ] **Step 5: Full suite**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```
git add client/src/components/CoachPanel.tsx client/tests/coachPanel.test.tsx client/src/api.ts
git commit -m "feat: vocab_suggestion cards with distinction + inline Know-this save flow"
```

---

## Task 7 — W1: Smarter, shorter daily prompts

**Files:**
- Modify: `server/src/brain/prompts.ts`

- [ ] **Step 1: Write failing test**

In `server/tests/prompts.test.ts`, add:

```ts
it('assembleNewsPrompt system prompt forbids broad geopolitics openers', () => {
  const { system } = assembleNewsPrompt({ topic: 'AI', headlines: [] });
  expect(system).toContain('25 words');
  expect(system).toContain('3 to 5 sentences');
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run server/tests/prompts.test.ts
```

- [ ] **Step 3: Update `assembleNewsPrompt` system string**

In `server/src/brain/prompts.ts`, replace the system array in `assembleNewsPrompt`:

```ts
system: [
  'You generate one short daily writing prompt for Idiomate.',
  'The learner is an advanced Chinese-L1 English writer in tech, finance, or startups.',
  'Rules: maximum 25 words for the prompt question. Concrete and specific: name an industry, technology, company type, or real scenario. Opinion OR story format: "Do you think X?", "Would you rather X?", or "Describe a time when X". The answer must fit in 3 to 5 sentences. Avoid geopolitics, sports diplomacy, abstract philosophy, or questions that need expert knowledge the writer may not have.',
  'Ground the prompt in the supplied headlines when they are available, but make it answerable from personal experience or opinion.',
  'Return ONLY JSON matching: {theme,text}.',
].join(' '),
```

- [ ] **Step 4: Run — expect PASS**

```
cd D:\dev\idiomate && npx vitest run server/tests/prompts.test.ts
```

- [ ] **Step 5: Full suite**

```
cd D:\dev\idiomate && npx vitest run
```

- [ ] **Step 6: Commit**

```
git add server/src/brain/prompts.ts server/tests/prompts.test.ts
git commit -m "feat: tighten daily prompt — max 25 words, concrete scenario, answerable in 3-5 sentences"
```

---

## Task 8 — W2: Return real news headlines with the daily prompt

**Files:**
- Modify: `server/src/routes/prompts.ts`
- Modify: `client/src/components/DailyPrompt.tsx`

`fetchNews(query)` already exists in `server/src/news.ts` — it hits Google News RSS and returns `NewsItem[]` with real titles, links, and source names.

- [ ] **Step 1: Write failing test**

In `server/tests/api.test.ts`, add:

```ts
it('GET /api/prompt/today includes newsItems in the response', async () => {
  const llm = new StubLLMProvider([
    JSON.stringify({ theme: 'tech', text: 'Do you think AI will replace junior engineers within 5 years?' }),
  ]);
  const db = migrate(openDb(':memory:'));

  // stub fetchHeadlines to return sample headlines
  const stubFetcher = async (_topic: string) => ['AI replaces coders', 'Open source surges'];

  await withServer(createApp({ db, llm, headlineFetcher: stubFetcher }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/prompt/today`, { headers: { 'x-user-id': USER_ID } });
    expect(res.status).toBe(200);
    const body = await res.json() as { newsItems?: unknown[] };
    expect(Array.isArray(body.newsItems)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run server/tests/api.test.ts
```

- [ ] **Step 3: Add news fetch to prompts route**

In `server/src/routes/prompts.ts`, update the `/today` handler:

```ts
import { fetchHeadlines, fetchNews, NEWS_TOPICS } from '../news.js';

// Inside the route handler, after generating the prompt:
router.get('/today', async (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const requestedTopic = String(req.query.topic ?? '').trim();
  const topic = requestedTopic || NEWS_TOPICS[topicCursor % NEWS_TOPICS.length];
  topicCursor += 1;

  const fetcher = deps.headlineFetcher ?? fetchHeadlines;
  let headlines: string[] = [];
  try {
    headlines = await fetcher(topic);
  } catch {
    headlines = [];
  }

  // Fetch real news items in parallel with prompt generation
  const newsPromise = fetchNews(topic).catch(() => []);

  try {
    const [prompt, newsItems] = await Promise.all([
      generateNewsPrompt(deps.utilityProvider, { topic, headlines, model: config.modelUtility }),
      newsPromise,
    ]);
    res.json({ date, ...prompt, newsItems: newsItems.slice(0, 3) });
  } catch {
    res.json({ date, ...OFFLINE_FALLBACK, newsItems: [] });
  }
});
```

Note: `fetchNews` is imported from `'../news.js'` — add it to the existing import line.

- [ ] **Step 4: Update DailyPrompt.tsx to show news**

Replace `client/src/components/DailyPrompt.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import type { Prompt } from '../../../shared/types';
import { getTodayPrompt } from '../api';

interface DailyPromptProps {
  onPrompt: (prompt: Prompt) => void;
}

export function DailyPrompt({ onPrompt }: DailyPromptProps) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

  const loadPrompt = async () => {
    setStatus('loading');
    try {
      const next = await getTodayPrompt();
      setPrompt(next);
      onPrompt(next);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void loadPrompt();
  }, []);

  return (
    <section className="surface" aria-label="daily prompt">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span className="section-label">Today's prompt{prompt?.theme ? ` - ${prompt.theme}` : ''}</span>
        <button type="button" className="btn-ghost" onClick={loadPrompt} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading' : 'New prompt'}
        </button>
      </div>
      <p className="prose mt-4 text-xl">
        {prompt?.text ?? (status === 'error' ? 'Could not load a prompt.' : 'Loading a prompt for you.')}
      </p>
      {prompt?.newsItems?.length ? (
        <div className="mt-4">
          <p className="section-label">For context</p>
          <ul className="mt-2 space-y-2">
            {prompt.newsItems.map(item => (
              <li key={item.link ?? item.title} className="text-sm leading-6">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-800 underline-offset-2 hover:text-violet-700 hover:underline"
                >
                  {item.title}
                </a>
                {item.source ? (
                  <span className="ml-2 text-xs text-slate-400">{item.source}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Add client test**

In `client/tests/` create `dailyPrompt.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DailyPrompt } from '../src/components/DailyPrompt';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows "For context" headlines when newsItems are returned', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      date: '2026-06-27',
      theme: 'tech',
      text: 'Do you think AI will replace junior engineers?',
      newsItems: [
        { title: 'AI coding tools hit record adoption', link: 'https://example.com/1', source: 'TechCrunch' },
        { title: 'Junior devs push back on automation', link: 'https://example.com/2', source: 'The Verge' },
      ],
    }),
  } as Response)));

  render(<DailyPrompt onPrompt={() => {}} />);

  expect(await screen.findByText('For context')).toBeInTheDocument();
  expect(screen.getByText('AI coding tools hit record adoption')).toBeInTheDocument();
  expect(screen.getByText('TechCrunch')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'AI coding tools hit record adoption' }))
    .toHaveAttribute('href', 'https://example.com/1');
});

it('hides "For context" when newsItems is empty', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      date: '2026-06-27',
      theme: 'tech',
      text: 'Do you think AI will replace junior engineers?',
      newsItems: [],
    }),
  } as Response)));

  render(<DailyPrompt onPrompt={() => {}} />);
  await screen.findByText('Do you think AI will replace junior engineers?');
  expect(screen.queryByText('For context')).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run full suite**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```
git add server/src/routes/prompts.ts client/src/components/DailyPrompt.tsx client/tests/dailyPrompt.test.tsx server/tests/api.test.ts
git commit -m "feat: include real Google News headlines alongside daily prompt"
```

---

## Task 9 — W3: TodayStrip click-to-reveal defCn + pos

**Files:**
- Modify: `client/src/components/TodayStrip.tsx`
- Modify: `client/tests/todayStrip.test.tsx`

- [ ] **Step 1: Write failing tests**

In `client/tests/todayStrip.test.tsx`, add:

```ts
it('clicking a word chip reveals its pos and defCn; clicking again hides it', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: 1, word: 'allocate', pos: 'verb', defCn: '分配', timesSuggested: 0, timesUsed: 0 },
        { id: 2, word: 'runway', pos: 'noun', defCn: '现金跑道', timesSuggested: 0, timesUsed: 0 },
      ],
    }),
  } as Response)));

  render(<TodayStrip />);
  await screen.findByText('allocate');

  // def hidden initially
  expect(screen.queryByText('分配')).not.toBeInTheDocument();

  // click to reveal
  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  expect(screen.getByText('分配')).toBeInTheDocument();
  expect(screen.getByText('verb')).toBeInTheDocument();

  // click again to hide
  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  expect(screen.queryByText('分配')).not.toBeInTheDocument();
});

it('clicking a second chip closes the first', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: 1, word: 'allocate', pos: 'verb', defCn: '分配', timesSuggested: 0, timesUsed: 0 },
        { id: 2, word: 'runway', pos: 'noun', defCn: '现金跑道', timesSuggested: 0, timesUsed: 0 },
      ],
    }),
  } as Response)));

  render(<TodayStrip />);
  await screen.findByText('allocate');

  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  expect(screen.getByText('分配')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'runway' }));
  expect(screen.queryByText('分配')).not.toBeInTheDocument();
  expect(screen.getByText('现金跑道')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run client/tests/todayStrip.test.tsx
```

- [ ] **Step 3: Update TodayStrip.tsx**

Replace `client/src/components/TodayStrip.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { getTodayVocab } from '../api';

interface TodayStripProps {
  refreshKey?: number;
}

export function TodayStrip({ refreshKey = 0 }: TodayStripProps) {
  const [items, setItems] = useState<Vocab[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setExpandedId(null);
    getTodayVocab()
      .then(result => {
        if (alive) setItems(result.items ?? []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!items?.length) return null;

  const visible = items.slice(0, 5);
  const overflow = items.length - visible.length;

  return (
    <section className="surface" aria-label="today vocabulary">
      <span className="section-label">Today</span>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {visible.map(item => (
          <span key={item.id ?? item.word} className="flex flex-col items-start gap-0.5">
            <button
              type="button"
              className="chip chip-blue"
              onClick={() => setExpandedId(prev => prev === item.id ? null : (item.id ?? null))}
            >
              {item.word}
            </button>
            {expandedId === item.id && (item.defCn || item.pos) ? (
              <span className="pl-1 text-xs text-slate-500">
                {item.pos ? <span className="font-medium">{item.pos}</span> : null}
                {item.pos && item.defCn ? ' · ' : null}
                {item.defCn ?? null}
              </span>
            ) : null}
          </span>
        ))}
        {overflow > 0 ? <span className="text-sm text-slate-500">+{overflow} more</span> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd D:\dev\idiomate && npx vitest run client/tests/todayStrip.test.tsx
```

- [ ] **Step 5: Full suite**

```
cd D:\dev\idiomate && npx vitest run
```

- [ ] **Step 6: Commit**

```
git add client/src/components/TodayStrip.tsx client/tests/todayStrip.test.tsx
git commit -m "feat: TodayStrip chip click reveals pos + defCn inline"
```

---

## Task 10 — W4: Sentence Patterns tab

**Files:**
- Create: `client/src/components/SentencePatterns.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/styles.css`
- Create: `client/tests/sentencePatterns.test.tsx`

- [ ] **Step 1: Add CSS classes**

In `client/src/styles.css`, add before the last closing block:

```css
.part-subject     { @apply rounded bg-blue-100 px-1 font-medium text-blue-800; }
.part-verb        { @apply rounded bg-violet-100 px-1 font-medium text-violet-800; }
.part-object      { @apply rounded bg-emerald-100 px-1 font-medium text-emerald-800; }
.part-adjective   { @apply rounded bg-amber-100 px-1 font-medium text-amber-800; }
.part-adverb      { @apply rounded bg-orange-100 px-1 font-medium text-orange-800; }
.part-clause      { @apply rounded bg-slate-100 px-1 text-slate-600; }
.part-prep-phrase { @apply rounded bg-rose-100 px-1 font-medium text-rose-800; }
.part-conjunction { @apply rounded bg-slate-100 px-1 text-slate-500; }
```

- [ ] **Step 2: Write failing test**

Create `client/tests/sentencePatterns.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SentencePatterns } from '../src/components/SentencePatterns';

afterEach(() => cleanup());

it('renders all 8 pattern titles', () => {
  render(<SentencePatterns />);
  expect(screen.getByText('Simple assertion')).toBeInTheDocument();
  expect(screen.getByText('Causal chain')).toBeInTheDocument();
  expect(screen.getByText('Concession + pivot')).toBeInTheDocument();
  expect(screen.getByText('Fronted adverb')).toBeInTheDocument();
  expect(screen.getByText('Subject complement')).toBeInTheDocument();
  expect(screen.getByText('Parallel list')).toBeInTheDocument();
  expect(screen.getByText('Conditional')).toBeInTheDocument();
  expect(screen.getByText('Passive emphasis')).toBeInTheDocument();
});

it('renders coloured subject and verb spans', () => {
  render(<SentencePatterns />);
  const subjects = document.querySelectorAll('.part-subject');
  const verbs = document.querySelectorAll('.part-verb');
  expect(subjects.length).toBeGreaterThan(0);
  expect(verbs.length).toBeGreaterThan(0);
});

it('renders the formula chip for each pattern', () => {
  render(<SentencePatterns />);
  expect(screen.getByText('S + V + O')).toBeInTheDocument();
  expect(screen.getByText('S + V + O, which + V + O')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run — expect FAIL**

```
cd D:\dev\idiomate && npx vitest run client/tests/sentencePatterns.test.tsx
```

- [ ] **Step 4: Create SentencePatterns.tsx**

Create `client/src/components/SentencePatterns.tsx`:

```tsx
import React from 'react';

type PartRole = 'subject' | 'verb' | 'object' | 'adjective' | 'adverb' | 'clause' | 'prep-phrase' | 'conjunction';

interface SentencePart {
  text: string;
  role: PartRole;
  label: string;
}

interface SentencePattern {
  id: string;
  name: string;
  formula: string;
  parts: Array<SentencePart | string>;
  tip: string;
}

const PATTERNS: SentencePattern[] = [
  {
    id: 'simple',
    name: 'Simple assertion',
    formula: 'S + V + O',
    parts: [
      { text: 'The company', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'launched', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'a new product', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '最基础结构，适合陈述事实。主语 + 动作 + 对象。',
  },
  {
    id: 'causal',
    name: 'Causal chain',
    formula: 'S + V + O, which + V + O',
    parts: [
      { text: 'The decision', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'cut', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'costs', role: 'object', label: '宾语 object' },
      ', ',
      { text: 'which', role: 'conjunction', label: '关系代词 — 引导结果从句' },
      ' ',
      { text: 'boosted', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'margins', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '用 which 引导结果从句，避免堆砌 and。前因后果，一气呵成。',
  },
  {
    id: 'concession',
    name: 'Concession + pivot',
    formula: 'Although + clause, S + V + O',
    parts: [
      { text: 'Although', role: 'conjunction', label: '让步连词' },
      ' ',
      { text: 'growth slowed', role: 'clause', label: '让步从句 concession clause' },
      ', ',
      { text: 'the firm', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'maintained', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'profitability', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '先承认不利面，再转折。显得客观有说服力。',
  },
  {
    id: 'fronted-adv',
    name: 'Fronted adverb',
    formula: 'Adv + , + S + V + O',
    parts: [
      { text: 'Historically', role: 'adverb', label: '副词 adverb — 时间维度' },
      ', ',
      { text: 'markets', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'recover', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'faster than expected', role: 'prep-phrase', label: '程度短语' },
      '.',
    ],
    tip: '副词前置强调时间 / 方式。比 "Markets historically recover" 更有重量感。',
  },
  {
    id: 'subject-complement',
    name: 'Subject complement',
    formula: 'S + linking-V + Adj',
    parts: [
      { text: 'The outlook', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'remains', role: 'verb', label: '系动词 linking verb' },
      ' ',
      { text: 'uncertain', role: 'adjective', label: '表语 predicate adjective' },
      '.',
    ],
    tip: 'remain / become / seem + 形容词，描述主语的状态变化。',
  },
  {
    id: 'parallel',
    name: 'Parallel list',
    formula: 'S + V + O₁, O₂, and O₃',
    parts: [
      { text: 'The strategy', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'prioritises', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'speed', role: 'object', label: '宾语1' },
      ', ',
      { text: 'cost efficiency', role: 'object', label: '宾语2' },
      ', and ',
      { text: 'scalability', role: 'object', label: '宾语3 — 最重要放最后' },
      '.',
    ],
    tip: '三项并列结构对称有力。最后一项最重要，读者印象最深。',
  },
  {
    id: 'conditional',
    name: 'Conditional',
    formula: 'If + clause, S + will/would + V + O',
    parts: [
      { text: 'If', role: 'conjunction', label: '条件连词' },
      ' ',
      { text: 'demand holds', role: 'clause', label: '条件从句 condition clause' },
      ', ',
      { text: 'revenue', role: 'subject', label: '主语 subject' },
      ' will ',
      { text: 'exceed', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'targets', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: 'will 用于现实可能；would 用于假设或反事实。条件放前，结果放后。',
  },
  {
    id: 'passive',
    name: 'Passive emphasis',
    formula: 'O + be + V(past) + by + Agent',
    parts: [
      { text: 'The policy', role: 'subject', label: '被动主语 (原宾语)' },
      ' was ',
      { text: 'shaped', role: 'verb', label: '被动谓语 past participle' },
      ' ',
      { text: 'by a decade of low rates', role: 'prep-phrase', label: '施动者短语 by-phrase' },
      '.',
    ],
    tip: '被动语态把结果放句首，强调影响而非施动者。财经写作常用。',
  },
];

function renderParts(parts: SentencePattern['parts']): React.ReactNode {
  return parts.map((part, index) => {
    if (typeof part === 'string') {
      return <span key={index}>{part}</span>;
    }
    return (
      <span
        key={index}
        className={`part-${part.role}`}
        title={part.label}
      >
        {part.text}
      </span>
    );
  });
}

export function SentencePatterns() {
  return (
    <section className="surface" aria-label="sentence patterns">
      <span className="section-label">Sentence patterns</span>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Eight core structures for professional English. Hover a coloured part to see its role.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {PATTERNS.map(pattern => (
          <div key={pattern.id} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{pattern.name}</span>
              <span className="chip text-xs font-mono">{pattern.formula}</span>
            </div>
            <p className="mt-3 font-serif text-base leading-8">
              {renderParts(pattern.parts)}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pattern.tip}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          { role: 'subject', label: '主语' },
          { role: 'verb', label: '谓语' },
          { role: 'object', label: '宾语' },
          { role: 'adjective', label: '形容词' },
          { role: 'adverb', label: '副词' },
          { role: 'clause', label: '从句' },
          { role: 'prep-phrase', label: '介词短语' },
        ].map(({ role, label }) => (
          <span key={role} className={`part-${role}`}>{label}</span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add Patterns tab to App.tsx**

In `client/src/App.tsx`:

Add to imports:
```ts
import { SentencePatterns } from './components/SentencePatterns';
```

Update `WorkspaceSection` type:
```ts
type WorkspaceSection = 'write' | 'words' | 'review' | 'me' | 'patterns' | 'admin';
```

Add to `workspaceSections` array (after `'me'`):
```ts
{ id: 'patterns', label: 'Patterns' },
```

Add section (after the `'me'` section):
```tsx
<section className={`workspace-page${activeSection === 'patterns' ? '' : ' hidden'}`} aria-label="sentence patterns">
  <SentencePatterns />
</section>
```

- [ ] **Step 6: Run — expect PASS**

```
cd D:\dev\idiomate && npx vitest run client/tests/sentencePatterns.test.tsx
```

- [ ] **Step 7: Full suite**

```
cd D:\dev\idiomate && npx vitest run
```

Expected: all pass.

- [ ] **Step 8: Commit**

```
git add client/src/components/SentencePatterns.tsx client/src/App.tsx client/src/styles.css client/tests/sentencePatterns.test.tsx
git commit -m "feat: Patterns tab with 8 colour-coded sentence structures and Chinese labels"
```

---

## Task 11 — Deploy

- [ ] **Step 1: Merge to Render branch and push**

```
git checkout codex/idiomate-sentence-lab-v1.4
git merge --ff-only codex/idiomate-coach-vocab-v2.2
git push origin codex/idiomate-sentence-lab-v1.4
git checkout codex/idiomate-coach-vocab-v2.2
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Coach flags calques + unnatural chunks with `distinction` | Tasks 2, 4 |
| Inline "Know this?" → save to vocab | Task 6 |
| Smarter shorter prompts | Task 7 |
| Real news headlines alongside prompt | Task 8 |
| TodayStrip click-to-reveal | Task 9 |
| Sentence patterns tab with colour-coded parts | Task 10 |
| `POST /api/vocab/capture-save` endpoint | Task 3 |
| All 151+ tests still passing | Every task step |

**Placeholder scan:** None found — every step has exact code.

**Type consistency:** `Annotation.distinction` (Task 1) used in `annotationZ` (Task 2), coach prompt (Task 4), CoachPanel `VocabSuggestCard` (Task 6). `Prompt.newsItems` (Task 1) used in prompts route (Task 8) and DailyPrompt.tsx (Task 8). `captureAndSaveVocab` defined in Task 5, called in Task 6. `SentencePatterns` defined in Task 10, imported in App.tsx Task 10.
