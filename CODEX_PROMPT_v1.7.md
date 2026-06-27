# Codex Handoff Prompt - Idiomate v1.7 (RAG memory layer)

> Paste below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
Executant engineer for Idiomate v1.7. Build a lightweight RAG (retrieval-augmented generation) memory layer so every AI call is informed by the user's writing history. Right now the coach has zero memory — it does not know what topics the user wrote about, which mistakes they keep repeating, or which words they are actively internalizing. Fix this in three workstreams. TDD throughout; commit after each workstream; stop and report before moving to the next.

## Context
- Project root: `D:\dev\idiomate`. Stack: Vite + React + TS + Tailwind client; Node + Express server; better-sqlite3; zod; vitest; OpenAI (gpt-4o + text-embedding-3-small).
- Auth: `x-user-id` header sets `req.userId` server-side.
- **Existing data relevant to RAG:**
  - `sessions` table — `id, user_id, date, draft_text, final_text, source, created_at`. Each row is one submitted writing session.
  - `annotations` table — joined to `sessions`; has `error_type, span, hint, model_rewrite`.
  - `error_tally` table — `user_id, error_type, count, last_seen`. Already tracks cumulative mistake frequency per user.
  - `vocab` table — `user_id, word, normalized, pos, def_cn, capture_count, times_used, times_suggested, ease, last_reviewed`.
  - `getTallies(db, userId)` in `server/src/db/dal.ts` returns sorted `ErrorTally[]`.
- **Coach prompt entry point:** `server/src/brain/prompts.ts → assembleCoachPrompt(ctx: CoachPromptContext)`. `CoachPromptContext` already has `topErrors: ErrorType[]` and `vocabCandidates`. The route that calls it is `server/src/routes/coach.ts`.
- **Sentence-lab prompt entry point:** `assembleSentenceLabPrompt` in the same file — same shape.
- Read `server/src/brain/prompts.ts`, `server/src/routes/coach.ts`, and `server/src/db/dal.ts` fully before touching anything.
- All existing 104 tests must stay green. Run `npx vitest run` after each workstream.

---

## Workstream S1 — Embedding pipeline: store session vectors in SQLite

**Goal:** When a writing session is submitted, embed its text and store the vector. No retrieval yet — just the storage side.

### 1a. New provider interface
Create `server/src/brain/embedding.ts`:
```ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}
```

### 1b. OpenAI implementation
Create `server/src/brain/openaiEmbedding.ts`:
```ts
import type { EmbeddingProvider } from './embedding.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000), // stay within token limit
      }),
    });
    if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}
```

### 1c. DB migration
In `server/src/db/db.ts`, add to the `migrate` function (append after existing `ensureColumn` calls):
```sql
CREATE TABLE IF NOT EXISTS session_embeddings (
  session_id INTEGER PRIMARY KEY,
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
Use `db.exec(...)` matching the existing migration pattern in the file.

### 1d. DAL functions
In `server/src/db/dal.ts`, export:

```ts
export function upsertSessionEmbedding(
  db: Database.Database,
  sessionId: number,
  userId: string,
  content: string,
  embedding: number[],
): void

export function getSessionEmbeddings(
  db: Database.Database,
  userId: string,
): Array<{ sessionId: number; content: string; embedding: number[] }>
```

`upsertSessionEmbedding` does an `INSERT OR REPLACE` into `session_embeddings`; `embedding` is stored as `JSON.stringify(array)` and parsed back on read.

### 1e. Wire into AppDependencies
In `server/src/appContext.ts` (or wherever `AppDependencies` is defined), add:
```ts
embeddingProvider?: EmbeddingProvider;
```
In `server/src/index.ts`, inject `new OpenAIEmbeddingProvider(config.apiKey)` when creating `deps`.

### 1f. Embed after session submission
In `server/src/routes/sessions.ts` (find the POST route that saves a session), after the session is inserted into the DB:
- Build the content string to embed: `[draft_text, final_text].filter(Boolean).join('\n\n').slice(0, 4000)`.
- Call `deps.embeddingProvider?.embed(content)` (optional chaining so tests without a real provider still work).
- On success call `upsertSessionEmbedding(deps.db, sessionId, req.userId, content, embedding)`.
- **Do NOT await this in the request path** — fire and forget with `.catch(err => console.error('embed error:', err))` so a failed embedding never breaks session submission.

### 1g. Tests
In `server/tests/api.test.ts`, add:

- `POST /api/sessions stores a session embedding when embeddingProvider is present` — provide a mock `embeddingProvider` that returns a fixed vector `[0.1, 0.2, 0.3]`; after submitting a session, query `session_embeddings` directly and assert the row exists with the correct `session_id` and `user_id`.
- `POST /api/sessions succeeds without embedding when embeddingProvider is absent` — no mock, assert session still saves (304 or 200, whatever the current success code is) and no `session_embeddings` row exists.

---

## Workstream S2 — Retrieval: inject memory into coach + sentence-lab prompts

**Goal:** When coaching a paragraph, retrieve the 3 most similar past sessions and the user's top weakness profile, then inject both into the system prompt.

### 2a. Cosine similarity utility
In `server/src/brain/embedding.ts`, add:
```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}
```

### 2b. Retrieval function
In `server/src/brain/embedding.ts`, add:
```ts
export function retrieveTopK(
  stored: Array<{ sessionId: number; content: string; embedding: number[] }>,
  queryEmbedding: number[],
  k = 3,
): Array<{ sessionId: number; content: string; score: number }>
```
Full-scan cosine similarity over `stored`, return top-k sorted descending by score.

### 2c. Extend `CoachPromptContext` and `SentenceLabPromptContext`
In `server/src/brain/prompts.ts`, add optional fields to both interfaces:
```ts
interface CoachPromptContext {
  // ... existing fields ...
  memoryContext?: MemoryContext;
}

interface SentenceLabPromptContext {
  // ... existing fields ...
  memoryContext?: MemoryContext;
}

export interface MemoryContext {
  topWeaknesses: string[];     // e.g. ['nominalization', 'article_misuse']
  relevantSnippets: string[];  // short excerpts from retrieved sessions
}
```

### 2d. Inject memory into assembled prompts
In `assembleCoachPrompt`, if `ctx.memoryContext` is present, append to the system prompt array (after the existing lines, before closing):
```
'User writing profile — persistent weaknesses to watch: ' + topWeaknesses.join(', ') + '.',
relevantSnippets.length
  ? 'Relevant past writing context:\n' + relevantSnippets.map((s, i) => `[${i+1}] ${s}`).join('\n')
  : '',
```
Apply the same injection to `assembleSentenceLabPrompt`.

Keep the injected text compact: each snippet is the first 200 chars of the retrieved session content.

### 2e. Build `MemoryContext` in the coach route
In `server/src/routes/coach.ts`, before calling `coachParagraph`:

1. Get user's top 3 error types from `getTallies(deps.db, req.userId)` (already available in DAL) — map to `topWeaknesses`.
2. Embed the incoming paragraph text using `deps.embeddingProvider?.embed(paragraph)`.
3. If embedding succeeded, retrieve top-3 similar sessions via `retrieveTopK(getSessionEmbeddings(deps.db, req.userId), queryEmbedding)`.
4. Build `memoryContext: { topWeaknesses, relevantSnippets }` and pass into `CoachContext` / `CoachPromptContext`.
5. If `embeddingProvider` is absent or any step fails, pass `memoryContext: undefined` — degrade gracefully, never block coaching.

Apply the same pattern in `server/src/routes/sentenceLab.ts`.

### 2f. Tests
In `server/tests/api.test.ts`, add:

- `POST /api/coach injects top weakness into system prompt when tallies exist` — seed an `error_tally` row for the user, provide a mock provider that captures the `system` string passed to it; assert the system prompt contains the error type name.
- `POST /api/coach injects relevant session snippet when embeddingProvider returns similar vector` — seed a session embedding; mock embedding provider returns a vector close to the stored one; assert system prompt contains part of the stored session content.
- `POST /api/coach succeeds with no memory when embeddingProvider is absent` — assert coaching still returns annotations.

---

## Workstream S3 — Lightweight user profile summary on client

**Goal:** Show the user a compact "Your profile" block so they can see what the AI remembers about them. No new AI calls — this is a read from existing DB data.

### 3a. API endpoint
In `server/src/routes/progress.ts` (or create `server/src/routes/profile.ts` if it doesn't exist — check first), add:
```
GET /api/memory/profile
```
Response shape:
```ts
{
  topWeaknesses: Array<{ errorType: string; count: number }>;  // top 5 from error_tally
  totalSessions: number;
  sessionEmbeddingsCount: number;                              // how many sessions have embeddings
  vocabCount: number;
  vocabByEase: { new: number; hard: number; easy: number };
}
```
Wire the route in `server/src/index.ts` as `/api/memory`.

In `client/src/api.ts`, add:
```ts
export function getMemoryProfile(): Promise<MemoryProfile>
```
Add `MemoryProfile` type to `client/src/api.ts` or `shared/types.ts`.

### 3b. `MemoryProfileCard` component
Create `client/src/components/MemoryProfileCard.tsx`.

- Fetches on mount.
- Renders inside a `surface` card with `section-label` "What I remember about you".
- Shows:
  - **Top patterns to watch:** up to 3 error type chips (use `.chip` style, convert `error_type` snake_case to readable label e.g. `nominalization` → `Nominalization`).
  - **Sessions analyzed:** `{sessionEmbeddingsCount} of {totalSessions}` with a note "New sessions are indexed automatically."
  - **Vocab:** `{vocabCount} words — {vocabByEase.new} new · {vocabByEase.hard} to revisit · {vocabByEase.easy} confident`
- If `topWeaknesses` is empty and `totalSessions === 0`: render "Write a few sessions and I'll start building your profile."

### 3c. Placement
Add `MemoryProfileCard` to the existing Profile tab in `client/src/App.tsx` (or wherever the profile/progress dashboard lives — grep for `ProfileDashboard` or `ProgressPanel`). Place it at the top, above existing content.

### 3d. Tests
In `client/tests/memoryProfileCard.test.tsx`:
- Renders top weaknesses as chips.
- Renders vocab ease breakdown.
- Renders empty-state message when no sessions and no weaknesses.

---

## Constraints (non-negotiable)
- **Graceful degradation everywhere.** Every embedding call is behind optional chaining or try/catch. A missing or failing `embeddingProvider` must never break session submission, coaching, or sentence-lab.
- **No new runtime dependencies.** Use the native `fetch` already present for the OpenAI API call. Store embeddings as `JSON.stringify` in TEXT column — no vector extension required.
- **Fire-and-forget embedding.** Session submission must not await the embedding. Use `.catch(console.error)` pattern.
- **Token budget.** Each injected snippet is max 200 chars. Total memory injection to any prompt is max ~400 tokens. Keep it tight.
- **No restyle of existing UI.** Only add new components and the memory profile card.
- Every new DAL function filters by `userId`.
- Run `npx vitest run` after each workstream; all tests must pass before proceeding.
- No em-dashes in any user-facing string.

---

## Output format — report after each workstream, then stop
```
WORKSTREAM <S1|S2|S3>: DONE
Commits: <hashes + one-line subjects>
Tests: <n passed / n total> (npx vitest run)
Files touched: <paths>
Deviations: <none | what & why>
Blockers: <none | list>
Next: <S2|S3|COMPLETE>
```
Wait for reviewer approval before starting the next workstream.
