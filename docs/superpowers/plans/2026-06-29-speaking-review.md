# Speaking Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a text-only Speak workflow that reviews speech-to-text transcripts in the web app and Chrome side panel, saves them to Idiomate history as `speaking_review`, and links reading-context vocabulary capture to `website_reading`.

**Architecture:** Reuse the existing Express + SQLite + React + Chrome side-panel architecture. Add a speaking-specific LLM prompt and route, persist reviews as normal `sessions` plus optional context columns, and surface the same API through a new web `Speak` tab and side-panel `Speak` mode.

**Tech Stack:** TypeScript, React, Vite, Express, Zod, better-sqlite3, Vitest, Chrome Manifest V3 side panel.

---

## Scope Check

The spec spans backend, web UI, and extension UI, but these are not independent subsystems: the web and extension both depend on one shared `/api/speaking/review` route and the same persisted history entry. Keep this as one plan so the data contract is implemented once.

---

## File Structure

- Modify `shared/types.ts`
  - Add `speaking_review` to `WritingSource`.
  - Add context metadata types for history and speaking review responses.
- Modify `server/src/brain/schema.ts`
  - Add `speakingReviewResponseZ`.
- Modify `server/src/brain/prompts.ts`
  - Add `SpeakingReviewPromptContext`.
  - Add `assembleSpeakingReviewPrompt`.
- Create `server/src/brain/speaking.ts`
  - Call the LLM with the speaking prompt and validate the response.
- Modify `server/src/db/db.ts`
  - Add migration columns on `sessions`: `context_label`, `context_title`, `context_url`, `context_excerpt`.
- Modify `server/src/db/dal.ts`
  - Extend session insert/history mapping with context metadata.
  - Extend `InsertSessionInput` with optional context fields.
- Create `server/src/routes/speaking.ts`
  - Implement `POST /api/speaking/review`.
- Modify `server/src/index.ts`
  - Mount `/api/speaking`.
- Modify `client/src/api.ts`
  - Add `reviewSpeaking`.
- Create `client/src/components/SpeakingReview.tsx`
  - Web/extension reusable transcript review UI.
- Modify `client/src/App.tsx`
  - Add the `Speak` tab and refresh profile/history after reviews.
- Modify `client/src/components/HistoryPanel.tsx`
  - Add friendly label and context rendering.
- Modify `client/src/components/CaptureWord.tsx`
  - Add optional `initialContextSentence` and `captureSource` props for extension reading capture.
- Modify `extension/public/content.js`
  - Store selected text plus page title and URL.
- Modify `extension/public/background.js`
  - Store context-menu selections plus tab title and URL.
- Modify `extension/sidepanel/App.tsx`
  - Add `Speak` mode, page-context display, and pass context to `SpeakingReview`.
- Add and modify tests:
  - `server/tests/coach.test.ts`
  - `server/tests/api.test.ts`
  - `server/tests/dal.test.ts`
  - `client/tests/speakingReview.test.tsx`
  - `client/tests/app.test.tsx`
  - `client/tests/historyPanel.test.tsx`
  - `extension/sidepanel/App.test.tsx`
  - `extension/sidepanel/component-seeding.test.tsx`
- Modify docs:
  - `README.md`
  - `docs/UPDATE_AND_HISTORY_PROGRESS.md`

---

### Task 1: Shared Types and Speaking Response Schema

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/src/brain/schema.ts`
- Test: `server/tests/coach.test.ts`

- [ ] **Step 1: Add a failing schema test**

Add this test to `server/tests/coach.test.ts` after the existing `coachParagraph` tests:

```ts
import { speakingReviewResponseZ } from '../src/brain/schema.js';

it('validates speaking review responses with takeaways', () => {
  const parsed = speakingReviewResponseZ.parse({
    nativeVersion: 'I think the article makes a fair point, but it overlooks execution risk.',
    takeaways: [
      'Use "makes a fair point" instead of "has a reasonable opinion" in this context.',
      'Use "overlooks" for a missed factor.',
    ],
    annotations: [{
      span: 'has a reasonable opinion',
      errorType: 'word_choice',
      hint: 'Use a more natural phrase for agreeing with an argument.',
      explanation: 'Native speakers usually say an article "makes a fair point" rather than "has an opinion."',
      rule: 'Article as argument, not person',
      ruleExample: {
        before: 'the article has a reasonable opinion',
        after: 'the article makes a fair point',
      },
      modelRewrite: 'makes a fair point',
    }],
  });

  expect(parsed.takeaways).toHaveLength(2);
  expect(parsed.annotations[0].errorType).toBe('word_choice');
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run:

```powershell
npx vitest run server/tests/coach.test.ts -t "validates speaking review responses"
```

Expected: FAIL because `speakingReviewResponseZ` is not exported.

- [ ] **Step 3: Update shared types**

In `shared/types.ts`, replace:

```ts
export type WritingSource = 'daily_writing' | 'coach_review' | 'sentence_lab';
```

with:

```ts
export type WritingSource = 'daily_writing' | 'coach_review' | 'sentence_lab' | 'speaking_review';
```

Then add these interfaces after `WritingHistoryAnnotation`:

```ts
export interface WritingHistoryContext {
  label?: string;
  title?: string;
  url?: string;
  excerpt?: string;
}
```

Update `WritingHistoryEntry` to include:

```ts
  context?: WritingHistoryContext;
```

Add these interfaces after `WritingHistoryResponse`:

```ts
export interface SpeakingReviewContext {
  label?: string;
  title?: string;
  url?: string;
  excerpt?: string;
}

export interface SpeakingReviewResponse {
  id: number;
  transcript: string;
  nativeVersion: string;
  annotations: Array<Annotation & { userRewrite?: string; accepted?: boolean }>;
  takeaways: string[];
  context?: SpeakingReviewContext;
}
```

- [ ] **Step 4: Add the speaking schema**

In `server/src/brain/schema.ts`, add this after `coachResponseZ`:

```ts
export const speakingReviewResponseZ = z.object({
  nativeVersion: z.string().min(1),
  annotations: z.array(annotationZ).default([]),
  takeaways: z.array(z.string().min(1)).min(1).max(4).default([]),
});
```

- [ ] **Step 5: Run the schema test and verify it passes**

Run:

```powershell
npx vitest run server/tests/coach.test.ts -t "validates speaking review responses"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add shared/types.ts server/src/brain/schema.ts server/tests/coach.test.ts
git commit -m "feat: add speaking review shared contract"
```

---

### Task 2: DB Session Context and History Mapping

**Files:**
- Modify: `server/src/db/db.ts`
- Modify: `server/src/db/dal.ts`
- Test: `server/tests/dal.test.ts`

- [ ] **Step 1: Add failing DAL tests for context columns and speaking history**

Add this test to `server/tests/dal.test.ts` after the migration metadata test:

```ts
it('migrates optional session context columns', () => {
  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  expect(sessionColumns.map(column => column.name)).toEqual(expect.arrayContaining([
    'context_label',
    'context_title',
    'context_url',
    'context_excerpt',
  ]));
});
```

Add this test after the daily mistake count test:

```ts
it('returns speaking reviews in history with reading context', () => {
  const sessionId = insertSession(db, USER_ID, {
    date: '2026-06-29',
    draftText: 'I think this article has a very useful perspective about AI agents.',
    finalText: 'I think this article offers a useful perspective on AI agents.',
    source: 'speaking_review',
    contextLabel: 'reading_reaction',
    contextTitle: 'AI agents move into finance workflows',
    contextUrl: 'https://example.com/ai-agents',
    contextExcerpt: 'Agents are entering finance workflows faster than expected.',
  });
  insertAnnotations(db, USER_ID, sessionId, [{
    paragraphIdx: 0,
    span: 'has a very useful perspective',
    errorType: 'word_choice',
    hint: 'Use a more natural verb for what an article does.',
    explanation: 'Articles usually "offer" or "give" a perspective.',
    modelRewrite: 'offers a useful perspective',
    userRewrite: 'offers a useful perspective',
    accepted: true,
  }]);

  expect(getWritingHistory(db, USER_ID, 5)[0]).toEqual(expect.objectContaining({
    source: 'speaking_review',
    draftText: 'I think this article has a very useful perspective about AI agents.',
    finalText: 'I think this article offers a useful perspective on AI agents.',
    context: {
      label: 'reading_reaction',
      title: 'AI agents move into finance workflows',
      url: 'https://example.com/ai-agents',
      excerpt: 'Agents are entering finance workflows faster than expected.',
    },
    annotations: [
      expect.objectContaining({
        span: 'has a very useful perspective',
        errorType: 'word_choice',
        accepted: true,
      }),
    ],
  }));
});
```

- [ ] **Step 2: Run the DAL tests and verify they fail**

Run:

```powershell
npx vitest run server/tests/dal.test.ts -t "session context|speaking reviews"
```

Expected: FAIL because `InsertSessionInput` lacks context fields and `sessions` lacks context columns.

- [ ] **Step 3: Add session context migrations**

In `server/src/db/db.ts`, add these lines after the existing `sessions` column migrations:

```ts
  ensureColumn(db, 'sessions', 'context_label', 'TEXT');
  ensureColumn(db, 'sessions', 'context_title', 'TEXT');
  ensureColumn(db, 'sessions', 'context_url', 'TEXT');
  ensureColumn(db, 'sessions', 'context_excerpt', 'TEXT');
```

- [ ] **Step 4: Extend DAL row and input types**

In `server/src/db/dal.ts`, update `HistorySessionRow` so it includes:

```ts
  context_label: string | null;
  context_title: string | null;
  context_url: string | null;
  context_excerpt: string | null;
```

Update `InsertSessionInput` so it includes:

```ts
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
```

- [ ] **Step 5: Add a context mapper**

In `server/src/db/dal.ts`, add this helper near `mapSessionAnnotation`:

```ts
function sessionContext(row: HistorySessionRow): WritingHistoryEntry['context'] {
  const context = {
    label: row.context_label ?? undefined,
    title: row.context_title ?? undefined,
    url: row.context_url ?? undefined,
    excerpt: row.context_excerpt ?? undefined,
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}
```

- [ ] **Step 6: Select and return context in history**

In `getWritingHistory`, replace the sessions query select list with:

```sql
    SELECT
      id,
      date,
      draft_text,
      final_text,
      COALESCE(source, 'daily_writing') AS source,
      created_at,
      context_label,
      context_title,
      context_url,
      context_excerpt
    FROM sessions
```

Update the `dailyEntries` map to include:

```ts
    context: sessionContext(session),
```

- [ ] **Step 7: Insert context fields**

In `insertSession`, replace the insert SQL with:

```ts
  const result = db.prepare(`
    INSERT INTO sessions (
      user_id, date, prompt_id, draft_text, final_text, duration_s, source,
      context_label, context_title, context_url, context_excerpt, created_at
    )
    VALUES (
      @userId, @date, @promptId, @draftText, @finalText, @durationS, @source,
      @contextLabel, @contextTitle, @contextUrl, @contextExcerpt, datetime('now')
    )
  `).run({
    userId,
    date: input.date ?? new Date().toISOString(),
    promptId: input.promptId ?? null,
    draftText: input.draftText,
    finalText: input.finalText ?? null,
    durationS: input.durationS ?? null,
    source: input.source ?? 'daily_writing',
    contextLabel: input.contextLabel?.trim() || null,
    contextTitle: input.contextTitle?.trim() || null,
    contextUrl: input.contextUrl?.trim() || null,
    contextExcerpt: input.contextExcerpt?.trim() || null,
  });
```

- [ ] **Step 8: Run the DAL tests and verify they pass**

Run:

```powershell
npx vitest run server/tests/dal.test.ts -t "session context|speaking reviews"
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add server/src/db/db.ts server/src/db/dal.ts server/tests/dal.test.ts
git commit -m "feat: persist session context metadata"
```

---

### Task 3: Speaking Prompt and Brain Function

**Files:**
- Modify: `server/src/brain/prompts.ts`
- Create: `server/src/brain/speaking.ts`
- Test: `server/tests/coach.test.ts`

- [ ] **Step 1: Add failing speaking brain tests**

Add these imports to `server/tests/coach.test.ts`:

```ts
import { reviewSpeakingTranscript } from '../src/brain/speaking.js';
import { assembleSpeakingReviewPrompt } from '../src/brain/prompts.js';
```

Add these tests:

```ts
it('assembles a speaking-specific prompt that avoids essay polishing and audio scoring', () => {
  const prompt = assembleSpeakingReviewPrompt({
    transcript: 'I think this article has a useful perspective about AI agents.',
    context: 'Spoken reaction after reading an article',
    contextTitle: 'AI agents move into finance workflows',
    contextUrl: 'https://example.com/ai-agents',
    contextExcerpt: 'Agents are entering finance workflows faster than expected.',
    topErrors: ['word_choice'],
    memoryContext: {
      topWeaknesses: ['word_choice'],
      relevantSnippets: ['Past writing context about precise verbs.'],
    },
  });

  expect(prompt.system).toContain('spoken-expression coach');
  expect(prompt.system).toContain('Do not judge pronunciation');
  expect(prompt.system).toContain('Do not turn the transcript into formal essay prose');
  expect(prompt.user).toContain('Spoken transcript:');
  expect(prompt.user).toContain('AI agents move into finance workflows');
  expect(prompt.user).toContain('https://example.com/ai-agents');
  expect(prompt.user).toContain('Persistent weaknesses to watch: word_choice.');
});

it('reviews speaking transcripts through the provider and validates the response', async () => {
  const provider: LLMProvider = {
    async complete(opts) {
      expect(opts.system).toContain('spoken-expression coach');
      expect(opts.user).toContain('I think this article has a useful perspective');
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
            before: 'the article has a useful perspective',
            after: 'the article offers a useful perspective',
          },
          modelRewrite: 'offers a useful perspective',
        }],
      });
    },
  };

  const result = await reviewSpeakingTranscript(provider, {
    transcript: 'I think this article has a useful perspective about AI agents.',
    topErrors: ['word_choice'],
    model: 'test-model',
  });

  expect(result.nativeVersion).toBe('I think this article offers a useful perspective on AI agents.');
  expect(result.takeaways).toEqual(['Use "offers a perspective" for what an article does.']);
  expect(result.annotations[0].modelRewrite).toBe('offers a useful perspective');
});
```

- [ ] **Step 2: Run speaking brain tests and verify they fail**

Run:

```powershell
npx vitest run server/tests/coach.test.ts -t "speaking"
```

Expected: FAIL because the speaking prompt and brain module do not exist.

- [ ] **Step 3: Add prompt context and prompt assembler**

In `server/src/brain/prompts.ts`, add this interface after `SentenceLabPromptContext`:

```ts
export interface SpeakingReviewPromptContext {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  topErrors: ErrorType[];
  memoryContext?: PromptMemoryContext;
}
```

Add this function after `assembleSentenceLabPrompt`:

```ts
export function assembleSpeakingReviewPrompt(ctx: SpeakingReviewPromptContext): { system: string; user: string } {
  const snippet = taxonomyReferenceSnippet(ALL_ERROR_TYPES);
  const focusedRules = rulesForTypes(ctx.topErrors);
  const ruleSnippet = rulesReferenceSnippet(focusedRules.length ? focusedRules : undefined);
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';
  const contextLines = [
    ctx.contextLabel ? `Context label: ${ctx.contextLabel}` : undefined,
    ctx.context ? `User context: ${ctx.context}` : undefined,
    ctx.contextTitle ? `Reading title: ${ctx.contextTitle}` : undefined,
    ctx.contextUrl ? `Reading URL: ${ctx.contextUrl}` : undefined,
    ctx.contextExcerpt ? `Reading excerpt: ${ctx.contextExcerpt}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    system: [
      'You are the Idiomate spoken-expression coach for an advanced Chinese-L1 English user.',
      'Review speech-to-text transcript text for grammar, precision, naturalness, idiomatic spoken English, and Chinese-L1 transfer.',
      'Do not judge pronunciation, accent, tone, pace, intonation, or speaking flow.',
      'Do not turn the transcript into formal essay prose. Preserve natural conversational directness.',
      'Ignore filler words and obvious speech-to-text artifacts unless they change meaning or create a real English issue.',
      'Identify the smallest useful spans, name each errorType, set a specific rule, give a concise hint, explanation, ruleExample, and modelRewrite.',
      'For word_choice, provide concrete alternatives and explain register or connotation differences.',
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a natural spoken version of the whole transcript for the same situation.',
      'Also produce takeaways: 2 to 4 short points the user should remember next time.',
      'Return ONLY JSON matching: {nativeVersion,takeaways,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?,distinction?}]}.',
      ...memoryContextLines(ctx.memoryContext),
    ].join(' '),
    user: [
      'Spoken transcript:',
      ctx.transcript,
      contextLines || 'Context: none provided',
      `Prioritize these recurring error types when relevant: ${topErrors}`,
      `Taxonomy:\n${snippet}`,
      `Named grammar and Chinglish rules:\n${ruleSnippet}`,
    ].join('\n\n'),
  };
}
```

- [ ] **Step 4: Create the speaking brain module**

Create `server/src/brain/speaking.ts`:

```ts
import type { ErrorType } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleSpeakingReviewPrompt, type PromptMemoryContext } from './prompts.js';
import { speakingReviewResponseZ } from './schema.js';

export interface SpeakingReviewContext {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  topErrors: ErrorType[];
  memoryContext?: PromptMemoryContext;
  model: string;
}

export async function reviewSpeakingTranscript(p: LLMProvider, ctx: SpeakingReviewContext) {
  const { system, user } = assembleSpeakingReviewPrompt(ctx);
  const raw = await p.complete({ system, user, model: ctx.model });
  return speakingReviewResponseZ.parse(JSON.parse(raw));
}
```

- [ ] **Step 5: Run speaking brain tests and verify they pass**

Run:

```powershell
npx vitest run server/tests/coach.test.ts -t "speaking"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add server/src/brain/prompts.ts server/src/brain/speaking.ts server/tests/coach.test.ts
git commit -m "feat: add speaking review prompt"
```

---

### Task 4: Speaking Review API Route

**Files:**
- Create: `server/src/routes/speaking.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/api.test.ts`

- [ ] **Step 1: Add a failing API route test**

Add this test to `server/tests/api.test.ts` near the Sentence Lab tests:

```ts
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
            before: 'the article has a useful perspective',
            after: 'the article offers a useful perspective',
          },
          modelRewrite: 'offers a useful perspective',
        }],
      });
    },
  };
  const embedded: string[] = [];
  const embeddingProvider: EmbeddingProvider = {
    async embed(text) {
      embedded.push(text);
      return [0.2, 0.8];
    },
  };

  await withServer(createApp({ db, coachProvider, embeddingProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/speaking/review`, {
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
    expect(embedded[0]).toContain('I think this article has a useful perspective');
  });
}, 10_000);
```

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```powershell
npx vitest run server/tests/api.test.ts -t "speaking/review"
```

Expected: FAIL with 404 for `/api/speaking/review`.

- [ ] **Step 3: Create the route**

Create `server/src/routes/speaking.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import type { Annotation, SpeakingReviewContext } from '../../../shared/types.js';
import type { AppDependencies } from '../appContext.js';
import { attachBookReferences } from '../brain/chinglishBook.js';
import { retrieveTopK } from '../brain/embedding.js';
import { reviewSpeakingTranscript } from '../brain/speaking.js';
import { config } from '../config.js';
import {
  getSessionEmbeddings,
  getTallies,
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
  recordErrors,
  upsertSessionEmbedding,
} from '../db/dal.js';

const MAX_TRANSCRIPT_CHARS = 8000;

const speakingReviewRequestZ = z.object({
  transcript: z.string().min(1).max(MAX_TRANSCRIPT_CHARS),
  context: z.string().optional(),
  contextLabel: z.string().optional(),
  contextTitle: z.string().optional(),
  contextUrl: z.string().url().optional().or(z.literal('')),
  contextExcerpt: z.string().optional(),
  date: z.string().optional(),
});

function clean(value?: string): string | undefined {
  const next = value?.trim();
  return next || undefined;
}

function contextFromBody(body: z.infer<typeof speakingReviewRequestZ>): SpeakingReviewContext | undefined {
  const context = {
    label: clean(body.contextLabel),
    title: clean(body.contextTitle),
    url: clean(body.contextUrl),
    excerpt: clean(body.contextExcerpt),
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}

function acceptedSpeakingAnnotations(annotations: Annotation[]): Array<Annotation & { paragraphIdx: number; userRewrite?: string; accepted: boolean }> {
  return annotations.map(annotation => ({
    ...annotation,
    paragraphIdx: 0,
    userRewrite: annotation.modelRewrite || annotation.ruleExample?.after,
    accepted: true,
  }));
}

export function createSpeakingRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/review', async (req, res, next) => {
    try {
      const body = speakingReviewRequestZ.parse(req.body);
      const transcript = body.transcript.trim();
      const tallies = getTallies(deps.db, req.userId);
      const topErrors = tallies
        .filter(tally => tally.errorType !== 'vocab_suggestion')
        .slice(0, 3)
        .map(tally => tally.errorType);
      const weaknesses = tallies.slice(0, 3).map(tally => tally.errorType);
      let snippets: string[] = [];
      if (deps.embeddingProvider) {
        try {
          const stored = getSessionEmbeddings(deps.db, req.userId);
          if (stored.length) {
            const qvec = await deps.embeddingProvider.embed(transcript.slice(0, 1000));
            snippets = retrieveTopK(stored, qvec, 3).map(result => result.content.slice(0, 200));
          }
        } catch {
          // Memory retrieval should never block speaking review.
        }
      }

      const reviewed = await reviewSpeakingTranscript(deps.coachProvider, {
        transcript,
        context: clean(body.context),
        contextLabel: clean(body.contextLabel),
        contextTitle: clean(body.contextTitle),
        contextUrl: clean(body.contextUrl),
        contextExcerpt: clean(body.contextExcerpt),
        topErrors,
        memoryContext: { topWeaknesses: weaknesses, relevantSnippets: snippets },
        model: config.modelCoach,
      });
      const enrichedAnnotations = attachBookReferences(reviewed.annotations);
      const context = contextFromBody(body);
      const sessionId = insertSession(deps.db, req.userId, {
        date: body.date,
        draftText: transcript,
        finalText: reviewed.nativeVersion,
        source: 'speaking_review',
        contextLabel: context?.label,
        contextTitle: context?.title,
        contextUrl: context?.url,
        contextExcerpt: context?.excerpt,
      });
      const storedAnnotations = acceptedSpeakingAnnotations(enrichedAnnotations);
      insertAnnotations(deps.db, req.userId, sessionId, storedAnnotations);
      recordErrors(
        deps.db,
        req.userId,
        storedAnnotations
          .map(annotation => annotation.errorType)
          .filter(errorType => errorType !== 'vocab_suggestion'),
      );
      for (const annotation of storedAnnotations) {
        if (annotation.errorType === 'vocab_suggestion' && annotation.vocabWord) {
          incrementVocabUsed(deps.db, req.userId, annotation.vocabWord);
        }
      }

      const embeddingContent = [transcript, reviewed.nativeVersion].join('\n\n').slice(0, 4000);
      try {
        deps.embeddingProvider?.embed(embeddingContent)
          .then(vec => upsertSessionEmbedding(deps.db, sessionId, req.userId, embeddingContent, vec))
          .catch(err => console.error('embed error:', err));
      } catch (err) {
        console.error('embed error:', err);
      }

      res.status(201).json({
        id: sessionId,
        transcript,
        nativeVersion: reviewed.nativeVersion,
        annotations: storedAnnotations,
        takeaways: reviewed.takeaways,
        context,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount the route**

In `server/src/index.ts`, add:

```ts
import { createSpeakingRouter } from './routes/speaking.js';
```

Then add after the sentence-lab route:

```ts
  app.use('/api/speaking', createSpeakingRouter(deps));
```

- [ ] **Step 5: Run the route test and verify it passes**

Run:

```powershell
npx vitest run server/tests/api.test.ts -t "speaking/review"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add server/src/routes/speaking.ts server/src/index.ts server/tests/api.test.ts
git commit -m "feat: add speaking review api"
```

---

### Task 5: Web SpeakingReview Component and API Client

**Files:**
- Modify: `client/src/api.ts`
- Create: `client/src/components/SpeakingReview.tsx`
- Test: `client/tests/speakingReview.test.tsx`

- [ ] **Step 1: Add a failing component test**

Create `client/tests/speakingReview.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpeakingReview } from '../src/components/SpeakingReview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reviews a pasted speaking transcript and renders the saved result', async () => {
  const onReviewed = vi.fn();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/speaking/review');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(expect.objectContaining({
      transcript: 'I think this article has a useful perspective about AI agents.',
      contextLabel: 'reading_reaction',
      context: 'After reading a market note',
    }));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        id: 42,
        transcript: body.transcript,
        nativeVersion: 'I think this article offers a useful perspective on AI agents.',
        takeaways: ['Use "offers a perspective" for what an article does.'],
        context: { label: 'reading_reaction' },
        annotations: [{
          span: 'has a useful perspective',
          errorType: 'word_choice',
          hint: 'Use a more natural verb.',
          explanation: 'Articles usually offer a perspective.',
          modelRewrite: 'offers a useful perspective',
          accepted: true,
        }],
      }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SpeakingReview onReviewed={onReviewed} />);

  fireEvent.change(screen.getByLabelText('Speech-to-text transcript'), {
    target: { value: 'I think this article has a useful perspective about AI agents.' },
  });
  fireEvent.change(screen.getByLabelText('Context'), {
    target: { value: 'After reading a market note' },
  });
  fireEvent.change(screen.getByLabelText('Review type'), {
    target: { value: 'reading_reaction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze transcript' }));

  expect(await screen.findByText('Native spoken version')).toBeInTheDocument();
  expect(screen.getByText('I think this article offers a useful perspective on AI agents.')).toBeInTheDocument();
  expect(screen.getByText('has a useful perspective')).toBeInTheDocument();
  expect(screen.getByText('Use "offers a perspective" for what an article does.')).toBeInTheDocument();
  await waitFor(() => expect(onReviewed).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```powershell
npx vitest run client/tests/speakingReview.test.tsx
```

Expected: FAIL because `SpeakingReview` does not exist.

- [ ] **Step 3: Add API payloads and client function**

In `client/src/api.ts`, add `SpeakingReviewResponse` to the import from `../../shared/types`.

Add these interfaces after `FollowUpPayload`:

```ts
export interface SpeakingReviewPayload {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  date?: string;
}
```

Add this function near the Sentence Lab API functions:

```ts
export function reviewSpeaking(payload: SpeakingReviewPayload): Promise<SpeakingReviewResponse> {
  return postJson<SpeakingReviewResponse>('/api/speaking/review', {
    ...payload,
    transcript: payload.transcript.trim(),
    context: payload.context?.trim() || undefined,
    contextLabel: payload.contextLabel?.trim() || undefined,
    contextTitle: payload.contextTitle?.trim() || undefined,
    contextUrl: payload.contextUrl?.trim() || undefined,
    contextExcerpt: payload.contextExcerpt?.trim() || undefined,
  });
}
```

- [ ] **Step 4: Create the reusable component**

Create `client/src/components/SpeakingReview.tsx`:

```tsx
import React, { useState } from 'react';
import type { SpeakingReviewResponse } from '../../../shared/types';
import { reviewSpeaking, type SpeakingReviewPayload } from '../api';

type ReviewStatus = 'idle' | 'reviewing' | 'error';

interface SpeakingReviewProps {
  onReviewed?: (result: SpeakingReviewResponse) => void;
  initialTranscript?: string;
  contextDefaults?: Omit<SpeakingReviewPayload, 'transcript' | 'context'>;
}

const reviewTypes = [
  { value: 'standalone_thought', label: 'Standalone thought' },
  { value: 'reading_reaction', label: 'Reading reaction' },
  { value: 'meeting_note', label: 'Meeting note' },
  { value: 'interview_answer', label: 'Interview answer' },
];

export function SpeakingReview({ onReviewed, initialTranscript = '', contextDefaults }: SpeakingReviewProps) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [context, setContext] = useState('');
  const [contextLabel, setContextLabel] = useState(contextDefaults?.contextLabel ?? 'standalone_thought');
  const [result, setResult] = useState<SpeakingReviewResponse | null>(null);
  const [status, setStatus] = useState<ReviewStatus>('idle');

  const runReview = async () => {
    if (!transcript.trim()) return;
    setStatus('reviewing');
    setResult(null);
    try {
      const next = await reviewSpeaking({
        transcript,
        context,
        contextLabel,
        contextTitle: contextDefaults?.contextTitle,
        contextUrl: contextDefaults?.contextUrl,
        contextExcerpt: contextDefaults?.contextExcerpt,
      });
      setResult(next);
      setStatus('idle');
      onReviewed?.(next);
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="speaking review">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Speak</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Review spoken English from STT</h2>
        </div>
        <span className="chip chip-blue">text only</span>
      </div>

      {contextDefaults?.contextTitle || contextDefaults?.contextUrl ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm leading-6 text-slate-600">
          {contextDefaults.contextTitle ? <p className="font-semibold text-slate-900">{contextDefaults.contextTitle}</p> : null}
          {contextDefaults.contextUrl ? (
            <a className="break-all text-emerald-800 underline" href={contextDefaults.contextUrl} target="_blank" rel="noreferrer">
              {contextDefaults.contextUrl}
            </a>
          ) : null}
          {contextDefaults.contextExcerpt ? <p className="mt-2 text-xs text-slate-500">{contextDefaults.contextExcerpt}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className="field-label" htmlFor="speaking-transcript">Speech-to-text transcript</label>
        <textarea
          id="speaking-transcript"
          className="field min-h-36 resize-y"
          value={transcript}
          onChange={event => setTranscript(event.target.value)}
          placeholder="Paste speech-to-text output here."
        />

        <label className="field-label" htmlFor="speaking-context">Context</label>
        <textarea
          id="speaking-context"
          className="field min-h-20 resize-y"
          value={context}
          onChange={event => setContext(event.target.value)}
          placeholder="Optional: who you were speaking to, what you were reacting to, or what you meant."
        />

        <label className="field-label" htmlFor="speaking-review-type">Review type</label>
        <select
          id="speaking-review-type"
          className="field"
          value={contextLabel}
          onChange={event => setContextLabel(event.target.value)}
        >
          {reviewTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!transcript.trim() || status === 'reviewing'}
          onClick={runReview}
        >
          {status === 'reviewing' ? 'Analyzing' : 'Analyze transcript'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Speaking review is unavailable right now.</p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="lab-panel">
            <p className="section-label">Native spoken version</p>
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-slate-800">{result.nativeVersion}</p>
          </div>

          {result.takeaways.length ? (
            <div className="lab-panel">
              <p className="section-label">What to say differently next time</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {result.takeaways.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}

          {result.annotations.length ? (
            <div className="lab-panel">
              <p className="section-label">Expression notes</p>
              <div className="mt-3 space-y-3">
                {result.annotations.map(annotation => (
                  <div key={`${annotation.errorType}-${annotation.span}`} className="result-block">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-slate-950">{annotation.span}</span>
                      <span className="chip">{annotation.errorType.replace(/_/g, ' ')}</span>
                    </div>
                    {annotation.rule ? <p className="mt-2 text-sm font-semibold text-slate-900">{annotation.rule}</p> : null}
                    <p className="mt-2 text-sm leading-6 text-slate-600">{annotation.hint}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{annotation.explanation}</p>
                    {annotation.modelRewrite ? (
                      <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm leading-6 text-emerald-900">{annotation.modelRewrite}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">This transcript sounds natural for the context.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Run the component test and verify it passes**

Run:

```powershell
npx vitest run client/tests/speakingReview.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add client/src/api.ts client/src/components/SpeakingReview.tsx client/tests/speakingReview.test.tsx
git commit -m "feat: add speaking review component"
```

---

### Task 6: Web App Speak Tab and History Context Rendering

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/HistoryPanel.tsx`
- Test: `client/tests/app.test.tsx`
- Test: `client/tests/historyPanel.test.tsx`

- [ ] **Step 1: Add failing app-tab expectation**

In `client/tests/app.test.tsx`, update the workspace tab expectation in the first test from:

```ts
expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Write', 'Lab', 'Words', 'Review', 'Me', 'Patterns']);
```

to:

```ts
expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Write', 'Speak', 'Lab', 'Words', 'Review', 'Me', 'Patterns']);
```

Add this fetch case in the test fetch mock:

```ts
    if (url.includes('/api/speaking/review')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 20,
          transcript: 'This article has a useful perspective.',
          nativeVersion: 'This article offers a useful perspective.',
          takeaways: ['Use "offers" for what an article does.'],
          annotations: [],
        }),
      } as Response);
    }
```

Add this assertion after the Write page assertions:

```ts
  fireEvent.click(within(nav).getByRole('button', { name: 'Speak' }));
  expect(screen.getByLabelText('speaking review')).toBeInTheDocument();
```

- [ ] **Step 2: Add a failing HistoryPanel context test**

Create `client/tests/historyPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders speaking review history with friendly label and reading context', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      entries: [{
        id: 1,
        source: 'speaking_review',
        date: '2026-06-29',
        draftText: 'This article has a useful perspective.',
        finalText: 'This article offers a useful perspective.',
        context: {
          label: 'reading_reaction',
          title: 'AI agents move into finance workflows',
          url: 'https://example.com/ai-agents',
          excerpt: 'Agents are entering finance workflows faster than expected.',
        },
        annotations: [{
          span: 'has a useful perspective',
          errorType: 'word_choice',
          accepted: true,
        }],
      }],
    }),
  } as Response)));

  render(<HistoryPanel />);

  expect(await screen.findByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'https://example.com/ai-agents' })).toHaveAttribute('href', 'https://example.com/ai-agents');
  expect(screen.getByText('Agents are entering finance workflows faster than expected.')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the web tests and verify they fail**

Run:

```powershell
npx vitest run client/tests/app.test.tsx client/tests/historyPanel.test.tsx
```

Expected: FAIL because the Speak tab and friendly history rendering are not implemented.

- [ ] **Step 4: Add Speak tab to App**

In `client/src/App.tsx`, add:

```ts
import { SpeakingReview } from './components/SpeakingReview';
```

Change the `WorkspaceSection` type to:

```ts
type WorkspaceSection = 'write' | 'speak' | 'lab' | 'words' | 'review' | 'me' | 'patterns' | 'admin';
```

Change `workspaceSections` to:

```ts
const workspaceSections: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'speak', label: 'Speak' },
  { id: 'lab', label: 'Lab' },
  { id: 'words', label: 'Words' },
  { id: 'review', label: 'Review' },
  { id: 'me', label: 'Me' },
  { id: 'patterns', label: 'Patterns' },
];
```

Add this section after the Write page:

```tsx
        <section className={`workspace-page${activeSection === 'speak' ? '' : ' hidden'}`} aria-label="speaking review page">
          <SpeakingReview
            onReviewed={() => {
              setProfileKey(key => key + 1);
              setHistoryKey(key => key + 1);
            }}
          />
        </section>
```

- [ ] **Step 5: Add friendly HistoryPanel labels and context**

In `client/src/components/HistoryPanel.tsx`, replace `sourceLabel` with:

```ts
function sourceLabel(source: WritingHistoryEntry['source']): string {
  const labels: Record<WritingHistoryEntry['source'], string> = {
    daily_writing: 'Daily writing',
    coach_review: 'Coach review',
    sentence_lab: 'Sentence lab',
    speaking_review: 'Speaking review',
  };
  return labels[source] ?? source.replace(/_/g, ' ');
}
```

Inside each history card, after the date/notes row and before `draftText`, add:

```tsx
            {entry.context ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white/75 p-3 text-xs leading-5 text-slate-500">
                {entry.context.title ? <p className="font-semibold text-slate-800">{entry.context.title}</p> : null}
                {entry.context.url ? (
                  <a className="break-all text-emerald-800 underline" href={entry.context.url} target="_blank" rel="noreferrer">
                    {entry.context.url}
                  </a>
                ) : null}
                {entry.context.excerpt ? <p className="mt-2">{entry.context.excerpt}</p> : null}
              </div>
            ) : null}
```

- [ ] **Step 6: Run the web tests and verify they pass**

Run:

```powershell
npx vitest run client/tests/app.test.tsx client/tests/historyPanel.test.tsx client/tests/speakingReview.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add client/src/App.tsx client/src/components/HistoryPanel.tsx client/tests/app.test.tsx client/tests/historyPanel.test.tsx
git commit -m "feat: add speak tab and history context"
```

---

### Task 7: Chrome Side Panel Speak Mode and Website Reading Capture

**Files:**
- Modify: `client/src/components/CaptureWord.tsx`
- Modify: `extension/public/content.js`
- Modify: `extension/public/background.js`
- Modify: `extension/sidepanel/App.tsx`
- Test: `extension/sidepanel/App.test.tsx`
- Test: `extension/sidepanel/component-seeding.test.tsx`

- [ ] **Step 1: Add failing component seeding tests for CaptureWord context and source**

In `extension/sidepanel/component-seeding.test.tsx`, update the CaptureWord test to:

```tsx
it('seeds CaptureWord from an initial word and context sentence', () => {
  render(
    <CaptureWord
      initialWord="margin pressure"
      initialContextSentence="From AI agents move into finance workflows: margin pressure"
      captureSource="website_reading"
      onSaved={() => {}}
    />,
  );

  expect(screen.getByDisplayValue('margin pressure')).toBeInTheDocument();
  expect(screen.getByDisplayValue('From AI agents move into finance workflows: margin pressure')).toBeInTheDocument();
});
```

Add this assertion to the mocked capture response path if the test checks request payload:

```ts
expect(body.source).toBe('website_reading');
```

- [ ] **Step 2: Add failing side-panel Speak mode test**

In `extension/sidepanel/App.test.tsx`, update the SentenceLab mock to include props:

```tsx
vi.mock('../../client/src/components/SentenceLab', () => ({
  SentenceLab: () => <div>Sentence lab</div>,
}));
```

Add a SpeakingReview mock:

```tsx
vi.mock('../../client/src/components/SpeakingReview', () => ({
  SpeakingReview: ({ contextDefaults }: { contextDefaults?: { contextTitle?: string; contextUrl?: string; contextExcerpt?: string } }) => (
    <div>
      <p>Speaking review</p>
      <p>{contextDefaults?.contextTitle}</p>
      <p>{contextDefaults?.contextUrl}</p>
      <p>{contextDefaults?.contextExcerpt}</p>
    </div>
  ),
}));
```

Add this test:

```tsx
it('offers Speak mode with page context from the pending selection', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: chrome.storage.AreaName) => void> = [];
  const pendingSelection = {
    text: 'Agents are entering finance workflows faster than expected.',
    ts: Date.now(),
    title: 'AI agents move into finance workflows',
    url: 'https://example.com/ai-agents',
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({ idiomate_pending_selection: pendingSelection })),
      },
      onChanged: {
        addListener: vi.fn(listener => listeners.push(listener)),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Speak' }));
  expect(screen.getByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByText('https://example.com/ai-agents')).toBeInTheDocument();
  expect(screen.getByText('Agents are entering finance workflows faster than expected.')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run extension tests and verify they fail**

Run:

```powershell
npx vitest run extension/sidepanel/component-seeding.test.tsx extension/sidepanel/App.test.tsx
```

Expected: FAIL because CaptureWord lacks the new props and the side panel has no Speak mode.

- [ ] **Step 4: Extend CaptureWord props**

In `client/src/components/CaptureWord.tsx`, change the props interface to:

```ts
interface CaptureWordProps {
  onSaved?: (vocab: Vocab) => void;
  initialWord?: string;
  initialContextSentence?: string;
  captureSource?: string;
}
```

Change the component signature and context state to:

```ts
export function CaptureWord({ onSaved, initialWord, initialContextSentence, captureSource }: CaptureWordProps) {
  const [word, setWord] = useState(initialWord ?? '');
  const [contextSentence, setContextSentence] = useState(initialContextSentence ?? '');
```

In `handleCapture`, replace:

```ts
      const enriched = await captureWord(word.trim(), contextSentence.trim());
      setPreview(enriched);
```

with:

```ts
      const enriched = await captureWord(word.trim(), contextSentence.trim());
      setPreview({
        ...enriched,
        source: captureSource ?? enriched.source,
        contextSentence: contextSentence.trim() || enriched.contextSentence,
      });
```

- [ ] **Step 5: Store page metadata in content and background scripts**

Replace `extension/public/content.js` with:

```js
const PENDING_SELECTION_KEY = 'idiomate_pending_selection';

function storeSelection(text) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: trimmed,
      title: document.title || '',
      url: window.location.href,
      ts: Date.now(),
    },
  });

  chrome.runtime.sendMessage({ type: 'idiomate-selection', text: trimmed }).catch(() => {});
}

document.addEventListener('mouseup', () => {
  const text = window.getSelection()?.toString().trim();
  if (!text) {
    return;
  }

  storeSelection(text);
});
```

Replace the `storeSelection` function in `extension/public/background.js` with:

```js
function storeSelection(text, tab) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  chrome.storage.local.set({
    [PENDING_SELECTION_KEY]: {
      text: trimmed,
      title: tab?.title || '',
      url: tab?.url || '',
      ts: Date.now(),
    },
  });
}
```

Update the context menu click handler call to:

```js
  storeSelection(info.selectionText, tab);
```

- [ ] **Step 6: Add side-panel Speak mode**

In `extension/sidepanel/App.tsx`, add:

```ts
import { SpeakingReview } from '../../client/src/components/SpeakingReview';
```

Update `PendingSelection`:

```ts
type PendingSelection = {
  text: string;
  ts: number;
  title?: string;
  url?: string;
};
```

Update `isPendingSelection`:

```ts
  return typeof selection.text === 'string' && typeof selection.ts === 'number';
```

Change `Mode` to:

```ts
type Mode = 'word' | 'sentence' | 'speak';
```

Update the mode control array:

```tsx
            {(['word', 'sentence', 'speak'] as const).map(mode => (
```

Update the button label:

```tsx
                {mode === 'word' ? 'Word' : mode === 'sentence' ? 'Sentence' : 'Speak'}
```

Add this before rendering the active tool:

```ts
  const readingContext = {
    contextLabel: 'reading_reaction',
    contextTitle: pendingSelection?.title,
    contextUrl: pendingSelection?.url,
    contextExcerpt: trimmedSource || undefined,
  };
  const readingContextSentence = [
    pendingSelection?.title ? `From ${pendingSelection.title}` : undefined,
    pendingSelection?.url,
    trimmedSource,
  ].filter(Boolean).join(': ');
```

Replace the active tool block with:

```tsx
          {activeMode === 'word' ? (
            <CaptureWord
              key={`word:${trimmedSource}`}
              initialWord={trimmedSource}
              initialContextSentence={readingContextSentence}
              captureSource="website_reading"
            />
          ) : activeMode === 'sentence' ? (
            <SentenceLab key={`sentence:${trimmedSource}`} initialSentence={trimmedSource} />
          ) : (
            <SpeakingReview
              key={`speak:${pendingSelection?.ts ?? 'manual'}`}
              contextDefaults={readingContext}
            />
          )}
```

- [ ] **Step 7: Run extension tests and verify they pass**

Run:

```powershell
npx vitest run extension/sidepanel/component-seeding.test.tsx extension/sidepanel/App.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add client/src/components/CaptureWord.tsx extension/public/content.js extension/public/background.js extension/sidepanel/App.tsx extension/sidepanel/App.test.tsx extension/sidepanel/component-seeding.test.tsx
git commit -m "feat: add speaking mode to extension"
```

---

### Task 8: Full Verification and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/UPDATE_AND_HISTORY_PROGRESS.md`

- [ ] **Step 1: Update README**

In `README.md`, add this section after `Quick Capture`:

```md
## Speaking Review

Use the Speak tab for speech-to-text output from macOS dictation, Doubao input method, RAGFlow, Riffado, or any other STT tool. Idiomate reviews the transcript as spoken English: grammar, precision, naturalness, native phrasing, and Chinese-L1 transfer.

The first version is text-only. It does not record audio, request microphone permission, or score pronunciation, tone, pace, intonation, or speaking flow.

Chrome side-panel Speak mode can carry the current page title, URL, and selected excerpt into the review, so spoken thoughts about a reading are saved in History alongside words captured from that same reading.
```

- [ ] **Step 2: Update progress log**

In `docs/UPDATE_AND_HISTORY_PROGRESS.md`, add this entry above the design checkpoint:

```md
## 2026-06-29 Speaking review implementation checkpoint

Purpose: implement the approved text-only Speak workflow across the web app, server, history, profile memory, and Chrome side panel.

Changes:

- Added `speaking_review` as a saved writing source.
- Added optional reading-context metadata to saved sessions.
- Added `/api/speaking/review`.
- Added the web `Speak` tab.
- Added Chrome side-panel `Speak` mode with page title, URL, and selected excerpt context.
- Tagged Chrome reading word captures as `website_reading`.

Validation:

- `npm test`
- `npm run build`
- `npm run build:ext`

Deploy impact:

- Render deploy picks up the new API route after this branch is pushed.
- Existing `.env`, SQLite state, and access-code behavior remain unchanged.
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
npx vitest run server/tests/coach.test.ts server/tests/dal.test.ts server/tests/api.test.ts client/tests/speakingReview.test.tsx client/tests/app.test.tsx client/tests/historyPanel.test.tsx extension/sidepanel/App.test.tsx extension/sidepanel/component-seeding.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Build web app**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds and writes `client/dist`.

- [ ] **Step 6: Build extension**

Run:

```powershell
npm run build:ext
```

Expected: Vite build succeeds and writes `extension/dist`.

- [ ] **Step 7: Inspect final git diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only planned files are modified.

- [ ] **Step 8: Commit docs and final verification**

```powershell
git add README.md docs/UPDATE_AND_HISTORY_PROGRESS.md
git commit -m "docs: document speaking review workflow"
```

- [ ] **Step 9: Push branch**

```powershell
git push origin codex/idiomate-v3
```

Expected: branch pushes cleanly to `https://github.com/DWSDavid/idiomate.git`.

---

## Self-Review

Spec coverage:

- Web `Speak` tab: Task 5 and Task 6.
- Chrome side-panel `Speak` mode: Task 7.
- Text-only STT consumption: Task 5 UI copy and Task 8 README.
- Grammar, precision, naturalness, native spoken phrasing: Task 3 speaking prompt.
- Saved history as `speaking_review`: Task 1 types, Task 2 DAL, Task 4 API.
- Profile, tallies, progress, memory retrieval: Task 4 route records errors and embeddings; existing profile/progress read sessions and annotations.
- Reading context: Task 2 context columns, Task 4 request/response, Task 6 history rendering, Task 7 extension page metadata.
- `website_reading` vocabulary source: Task 7 CaptureWord source propagation.
- Existing flows protected: Task 8 focused tests, full tests, web build, extension build.

Placeholder scan:

- The plan contains no unresolved implementation markers.
- Every new function, route, component, and test has concrete file paths and code snippets.

Type consistency:

- `WritingSource` uses `speaking_review` everywhere.
- Context fields use `contextLabel`, `contextTitle`, `contextUrl`, and `contextExcerpt` in API/client code.
- History renders the normalized `context: { label, title, url, excerpt }`.
- Extension pending selection stores `title` and `url`, then maps them into `contextDefaults`.
