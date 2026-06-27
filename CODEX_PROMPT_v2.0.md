# Codex Handoff Prompt — Idiomate v2.0

> How to use: start Codex with the message:
> `Read CODEX_PROMPT_v2.0.md in D:\dev\idiomate and execute it exactly.`
> Or paste this file's contents directly.

---

## Role
Executant engineer for Idiomate v2.0. This prompt covers four independent feature tracks — review loop, word deep dive, RAG memory, and IA restructure — combined into one execution plan ordered by dependency, not by feature. Do not mix features within a workstream. TDD throughout; commit after each workstream; stop and report before the next.

## Tech stack
Vite + React + TS + Tailwind client · Node + Express server · better-sqlite3 · zod · vitest · OpenAI (gpt-4o + text-embedding-3-small). Auth: `x-user-id` header (UUID from client localStorage) → `req.userId`. `x-access-code` when env set.

## Files to read before touching anything
- `shared/types.ts` — `Vocab`, `VocabListItem`, all shared types
- `server/src/db/dal.ts` — all DAL functions; understand `mapVocab`, `upsertVocab`, `normalizeVocabWord`, `getTallies`
- `server/src/db/db.ts` — migration pattern (`ensureColumn`, `db.exec`)
- `server/src/brain/prompts.ts` — `assembleCoachPrompt`, `assembleSentenceLabPrompt` and their context interfaces
- `server/src/brain/enrich.ts` — `enrichWord`, `translateChineseVocab` (pattern for new brain functions)
- `server/src/brain/schema.ts` — all zod schemas (add yours here)
- `server/src/routes/vocab.ts` — all vocab routes (add new ones here)
- `server/src/routes/coach.ts` — how coach route builds context
- `server/src/routes/sessions.ts` — session submission route
- `server/src/index.ts` — route mounts and `AppDependencies`
- `client/src/App.tsx` — current tab structure (6 tabs: Write / Patterns / Vocabulary / History / Sentence Lab / Admin)
- `client/src/api.ts` — all client API functions

All 104 existing tests must stay green. Run `npx vitest run` after every workstream.

---

## Dependency map (why this order)

```
W1 Foundation   — startup fix + ALL DB migrations + ALL brain functions   (nothing blocks these)
W2 Backend      — ALL DAL additions + ALL new API routes                  (needs W1 schema)
W3 Components   — ALL new UI components                                   (needs W2 APIs)
W4 IA           — tab restructure                                         (needs W3 components placed)
```

Within each workstream, items are independent of each other and can be done in any order.

---

## W1 — Foundation: startup + DB + brain

### 1-A  One-click startup
1. In `client/vite.config.ts` add `server: { open: true }` to the config object — browser opens automatically on `npm run dev`.
2. Create `start.bat` in project root:
   ```bat
   @echo off
   cd /d %~dp0
   npm run dev
   ```

### 1-B  All DB migrations (do in one block)
In `server/src/db/db.ts`, append to `migrate` using `ensureColumn` for new columns on existing tables and `db.exec` for new tables. Match the existing pattern exactly.

**New columns on `vocab`:**
```ts
ensureColumn(db, 'vocab', 'ease',          "TEXT DEFAULT 'new' CHECK(ease IN ('new','hard','easy'))");
ensureColumn(db, 'vocab', 'last_reviewed', 'TEXT');
ensureColumn(db, 'vocab', 'word_family',   'TEXT');
ensureColumn(db, 'vocab', 'near_synonyms', 'TEXT');
```

**New table `session_embeddings`:**
```sql
CREATE TABLE IF NOT EXISTS session_embeddings (
  session_id INTEGER PRIMARY KEY,
  user_id    TEXT NOT NULL,
  content    TEXT NOT NULL,
  embedding  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 1-C  Shared types
Add to `Vocab` interface in `shared/types.ts`:
```ts
ease?: 'new' | 'hard' | 'easy';
lastReviewed?: string;
wordFamily?: string[];
nearSynonyms?: Array<{ word: string; distinction: string }>;
```
Add `id: number` to `VocabListItem` if not already present.

### 1-D  Brain: EmbeddingProvider
Create `server/src/brain/embedding.ts`:
```ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export function retrieveTopK(
  stored: Array<{ sessionId: number; content: string; embedding: number[] }>,
  queryEmbedding: number[],
  k = 3,
): Array<{ sessionId: number; content: string; score: number }> {
  return stored
    .map(s => ({ sessionId: s.sessionId, content: s.content, score: cosineSimilarity(queryEmbedding, s.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
```

Create `server/src/brain/openaiEmbedding.ts`:
```ts
import type { EmbeddingProvider } from './embedding.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const data = await res.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}
```

Add `embeddingProvider?: EmbeddingProvider` to `AppDependencies` in `server/src/appContext.ts`.
In `server/src/index.ts`, inject `new OpenAIEmbeddingProvider(config.apiKey)` into `deps`.

### 1-E  Brain: Word Deep Dive
Add to `server/src/brain/schema.ts`:
```ts
export const nearSynonymZ = z.object({
  word: z.string().min(1),
  distinction: z.string().min(1),
});
export const wordDeepDiveZ = z.object({
  wordFamily:    z.array(z.string().min(1)).min(1).max(12),
  nearSynonyms:  z.array(nearSynonymZ).max(4),
  usageExamples: z.array(z.string().min(1)).min(1).max(3),
});
export type WordDeepDive = z.infer<typeof wordDeepDiveZ>;
```

Add to `server/src/brain/enrich.ts`:
```ts
export async function deepDiveWord(provider: LLMProvider, word: string, model: string): Promise<WordDeepDive>
```
System prompt (single joined string):
```
You are a vocabulary analyst for a professional English writing assistant.
Return ONLY JSON. Every field is a string or array of strings; never use booleans.
Shape: { wordFamily, nearSynonyms, usageExamples }.
wordFamily: all common inflected and derived forms including the base form. Max 12 items.
nearSynonyms: up to 4 near-synonyms each with a one-sentence "distinction" explaining when to prefer one over the other in professional writing — be specific about register, formality, and domain.
usageExamples: exactly 3 short sentences in finance, tech, or professional writing contexts. Each must use the word or one of its family forms naturally.
```
User: `Word: ${word}`.
Parse with `wordDeepDiveZ.parse(JSON.parse(raw))`. Apply `.catch(undefined)` tolerance on `nearSynonyms` field (same pattern as `enrichedVocabZ` optional fields).

### 1-F  Extend coach + sentence-lab prompt contexts
In `server/src/brain/prompts.ts`, add to `CoachPromptContext` and `SentenceLabPromptContext`:
```ts
memoryContext?: {
  topWeaknesses: string[];    // error_type strings, e.g. ['nominalization', 'article_misuse']
  relevantSnippets: string[]; // first 200 chars of retrieved session content
};
```
In both `assembleCoachPrompt` and `assembleSentenceLabPrompt`, if `ctx.memoryContext` is present, append to the system prompt array (after existing lines):
```ts
`Persistent weaknesses to watch: ${ctx.memoryContext.topWeaknesses.join(', ')}.`,
...ctx.memoryContext.relevantSnippets.map((s, i) => `Past writing context [${i+1}]: ${s}`),
```
Only append non-empty weaknesses/snippets.

### W1 tests
- `cosineSimilarity` returns 1.0 for identical vectors and ~0 for orthogonal.
- `retrieveTopK` returns correctly ranked top-k items.
- `deepDiveWord` (mock provider returning valid JSON) parses correctly.
- `assembleCoachPrompt` with `memoryContext` includes weakness string in system prompt.

---

## W2 — Backend: DAL + API routes

### 2-A  DAL additions (all in `server/src/db/dal.ts`)

Update `mapVocab` to include: `ease: row.ease ?? 'new'`, `lastReviewed: row.last_reviewed ?? undefined`, `wordFamily: fromJson(row.word_family)`, `nearSynonyms: row.near_synonyms ? JSON.parse(row.near_synonyms) : undefined`.
Update `vocabParams` to include: `ease: item.ease ?? 'new'`, `lastReviewed: item.lastReviewed ?? null`, `wordFamily: toJson(item.wordFamily)`, `nearSynonyms: item.nearSynonyms ? JSON.stringify(item.nearSynonyms) : null`.
Update the INSERT and ON CONFLICT UPDATE in `upsertVocab` to include the four new columns.
If `getVocabList` SELECT doesn't already include `id`, add it and include in the mapped `VocabListItem`.

**New DAL functions:**
```ts
// Review queue — smart ordering: new first, then hard, then easy; within ease ordered by recency
export function getReviewQueue(db: Database.Database, userId: string, limit = 10): Vocab[]
// SQL: ORDER BY CASE ease WHEN 'new' THEN 0 WHEN 'hard' THEN 1 WHEN 'easy' THEN 2 END,
//      CASE WHEN ease='easy' THEN last_reviewed ELSE last_captured END DESC LIMIT ?

// Record a review result
export function recordReview(db: Database.Database, userId: string, vocabId: number, ease: 'easy' | 'hard'): void
// UPDATE vocab SET ease=?, last_reviewed=datetime('now') WHERE id=? AND user_id=?

// Deep dive: store (cached) and retrieve
export function saveDeepDive(db: Database.Database, userId: string, vocabId: number, dive: WordDeepDive): void
// UPDATE vocab SET word_family=JSON, near_synonyms=JSON WHERE id=? AND user_id=?

export function getDeepDiveCache(db: Database.Database, userId: string, vocabId: number): (WordDeepDive & { usageExamples: string[] }) | null
// SELECT word_family, near_synonyms, examples FROM vocab WHERE id=? AND user_id=?
// Return null if word_family IS NULL. usageExamples from existing examples column.

// Session embeddings
export function upsertSessionEmbedding(db: Database.Database, sessionId: number, userId: string, content: string, embedding: number[]): void
export function getSessionEmbeddings(db: Database.Database, userId: string): Array<{ sessionId: number; content: string; embedding: number[] }>
// SELECT and parse embedding TEXT column as JSON array

// Today's captures
export function getTodayVocab(db: Database.Database, userId: string, limit = 20): Vocab[]
// WHERE user_id=? AND date(last_captured)=date('now') ORDER BY last_captured DESC LIMIT ?

// Memory profile summary
export function getMemoryProfile(db: Database.Database, userId: string): {
  topWeaknesses: Array<{ errorType: string; count: number }>;
  totalSessions: number;
  sessionEmbeddingsCount: number;
  vocabCount: number;
  vocabByEase: { new: number; hard: number; easy: number };
}
// Combine: getTallies top 5, COUNT sessions, COUNT session_embeddings, COUNT vocab, GROUP BY ease
```

### 2-B  API routes

**In `server/src/routes/vocab.ts`:**
```
GET  /api/vocab/review-queue         → { items: Vocab[] }   (calls getReviewQueue limit=10)
POST /api/vocab/:id/review           body: { ease: 'easy'|'hard' }  → 204  (zod validate; 404 if not user's)
GET  /api/vocab/:id/deep-dive        → WordDeepDiveResponse  (cache-first; generate + store if miss)
GET  /api/vocab/today                → { items: Vocab[] }   (calls getTodayVocab)
```

For `/api/vocab/:id/deep-dive`, after generating from LLM, also return:
```ts
relatedInYourList: string[]
// SELECT word FROM vocab WHERE user_id=? AND normalized IN (?)
// candidates = [...wordFamily, ...nearSynonyms.map(s=>s.word)].map(normalizeVocabWord)
// single scoped SQL query; no JS-side loops over full vocab
```

**Add `/api/memory` router** (`server/src/routes/memory.ts`, mounted in `index.ts` as `/api/memory`):
```
GET /api/memory/profile  → getMemoryProfile result
```

**In `server/src/routes/sessions.ts`**, after saving a session successfully, fire-and-forget embedding:
```ts
const content = [draft_text, final_text].filter(Boolean).join('\n\n').slice(0, 4000);
deps.embeddingProvider?.embed(content)
  .then(vec => upsertSessionEmbedding(deps.db, sessionId, req.userId, content, vec))
  .catch(err => console.error('embed error:', err));
// Do NOT await — must not block the response
```

**In `server/src/routes/coach.ts`**, before calling `coachParagraph`, build `memoryContext`:
```ts
const weaknesses = getTallies(deps.db, req.userId).slice(0, 3).map(t => t.errorType);
let snippets: string[] = [];
if (deps.embeddingProvider) {
  try {
    const qvec = await deps.embeddingProvider.embed(paragraph.slice(0, 1000));
    const stored = getSessionEmbeddings(deps.db, req.userId);
    snippets = retrieveTopK(stored, qvec, 3).map(r => r.content.slice(0, 200));
  } catch { /* degrade gracefully */ }
}
// pass memoryContext: { topWeaknesses: weaknesses, relevantSnippets: snippets } into CoachContext
```
Apply same pattern in `server/src/routes/sentenceLab.ts`.

### W2 tests
- `GET /api/vocab/review-queue` returns items ordered new→hard→easy.
- `POST /api/vocab/:id/review` updates ease + last_reviewed; 404 for other user's word.
- `GET /api/vocab/:id/deep-dive` generates on miss, returns cached on second call (mock called once).
- `GET /api/vocab/:id/deep-dive` includes `relatedInYourList` when family words exist in user's vocab.
- `GET /api/vocab/today` returns only today's captures.
- `GET /api/memory/profile` returns correct shape with ease breakdown.
- `POST /api/sessions` embeds async when provider present; still succeeds when provider absent.
- `POST /api/coach` includes weakness in system prompt when tallies exist; succeeds with no memory when provider absent.

---

## W3 — Components (all new UI; no restyling of existing components)

Use only existing CSS classes: `surface`, `section-label`, `field-label`, `chip`, `chip-blue`, `chip-slate`, `btn-primary`, `result-block`. Add to `styles.css` only if genuinely needed.

Add client API functions for all new endpoints before writing components.

### 3-A  `ReviewPanel` (`client/src/components/ReviewPanel.tsx`)

Props: `{ onGoWrite: () => void }`

States: `loading` | `empty` | `active` | `done`.

**Card lifecycle (one card at a time, progress `3 / 10` above card):**
1. **Hidden face** — word + `pos` chip + `kind` chip. "Reveal" button.
2. **Revealed face** — adds `defCn`, first 2 examples, first 2 collocations. Two buttons: **"Got it ✓"** (records `easy`) and **"Again ↺"** (records `hard`). Both call `recordReview` then advance.

**Done screen:** "You knew X of Y." · "Review more" (refetch) · "Go write" (calls `onGoWrite`).

**Empty state:** "Capture some words first — they will appear here for review."

### 3-B  `WordDeepDivePanel` (`client/src/components/WordDeepDivePanel.tsx`)

Props: `{ vocabId: number; word: string }`

States: `idle` (never opened) | `loading` | `loaded` | `error`.
Fetch on first expand only; do not re-fetch once loaded.

**Three sections:**

**Word family** (`field-label` label "Word family")
Each family member as `.chip`. Words in `relatedInYourList` use `.chip.chip-blue` instead. Add title "in your list" to those chips.

**Compare** (`field-label` label "Compare")
For each near-synonym: bold word + dash + distinction in `text-sm text-slate-500`. If in `relatedInYourList`, add inline `.chip.chip-blue` "in your list" badge.

**In use** (`field-label` label "In use")
Ordered list, up to 3 sentences, `text-sm leading-6`. Bold family word occurrences (case-insensitive string replace, wrap match in `<strong>`).

Loading: `"Loading..."` in `text-sm text-slate-400`. Error: `"Could not load word details."` in `text-sm text-red-600`.

**Wire into `VocabularyPanel`:**
- Add `expandedId: number | null` state (only one open at a time).
- Add a toggle button per row ("Details" / "Close") in `text-xs text-slate-400`.
- When expanded, render `<WordDeepDivePanel vocabId={item.id} word={item.word} />` below the row.
- Ensure `item.id` is available from `VocabListItem` (added in W1-C).

### 3-C  `TodayStrip` (`client/src/components/TodayStrip.tsx`)

Props: `{ refreshKey?: number }`

- Fetch `getTodayVocab` on mount and when `refreshKey` changes.
- If no words today: return `null` (render nothing).
- If words exist: compact horizontal strip, first 5 words as `.chip.chip-blue`, "+N more" plain text if >5.
- Label "Today" in `section-label` style inline before chips.
- Place in `App.tsx` at the top of the Write tab content, above `VocabPrime`. Wire `refreshKey` to the existing `vocabKey` counter (already incremented on vocab save).

### 3-D  `MemoryProfileCard` (`client/src/components/MemoryProfileCard.tsx`)

- Fetch `getMemoryProfile` on mount.
- `section-label` "What I know about you".
- **Top patterns:** up to 3 error type chips (`.chip`). Convert snake_case to Title Case (e.g. `article_misuse` → `Article misuse`).
- **Sessions indexed:** `{sessionEmbeddingsCount} of {totalSessions} sessions analyzed.`
- **Vocab:** `{vocabCount} words — {new} new · {hard} to revisit · {easy} confident`
- Empty state (no sessions, no weaknesses): "Write a few sessions and I will start building your profile."

### W3 tests
- `ReviewPanel`: card flips on Reveal; Got it/Again call `recordReview` and advance; done screen shows after last card; Go write calls `onGoWrite`; empty state when no items.
- `WordDeepDivePanel`: loading state; chips render; related words have chip-blue; near-synonym distinctions shown; usage examples shown; error state; no re-fetch after load.
- `TodayStrip`: renders chips when words exist; "+N more" when >5; returns null when empty.
- `MemoryProfileCard`: error types shown; vocab ease breakdown; empty state.

---

## W4 — IA: four clean top-level tabs

**Goal:** Collapse 6 tabs → 4. Less surface area, clearer jobs.

### Target structure

| Tab | ID | Contains |
|-----|----|---------|
| Write | `write` | `WriteSurface` (daily prompt + coach panels). `TodayStrip` at top (added in W3). |
| Words | `words` | `ChineseToVocabBox`, `CaptureWord`, `VocabularyPanel` (with deep dive). Remove from wherever they currently live. |
| Review | `review` | `ReviewPanel` (new). |
| Me | `me` | `ProfileDashboard`, `ProgressPanel`, `MemoryProfileCard` (new). History accessible here too. |

**Do not include Admin tab** in the main nav — it is accessible only via direct URL or keep it as a hidden tab with ID `admin` that only shows when `activeSection === 'admin'` (preserves existing admin access without cluttering the nav).

### Steps
1. Read `App.tsx` in full — understand what renders in each current section.
2. Update `WorkspaceSection` type to `'write' | 'words' | 'review' | 'me' | 'admin'`.
3. Update `workspaceSections` array to exactly 4 visible entries (Write / Words / Review / Me). Admin tab nav entry removed but content still conditionally rendered.
4. Move component rendering into the new sections. Do not rewrite components — only move where they are rendered.
5. Default active: `'write'`.
6. Preserve `localStorage` persistence of active tab if it currently exists.
7. Pass `onGoWrite={() => setActiveSection('write')}` to `ReviewPanel`.

### W4 tests
In `client/tests/app.test.tsx`:
- Four tab labels render: Write, Words, Review, Me.
- Clicking Words shows vocab capture UI.
- Clicking Review shows the review panel.
- All existing passing tests still pass.

---

## Constraints (non-negotiable)
- **Embedding is always fire-and-forget.** Never block a response on it. Any failure is `console.error` only.
- **Deep dive is cache-first.** Never regenerate if `word_family` column is populated.
- **`relatedInYourList` is one SQL query** — do not loop over the full vocab in JS.
- **Every new DAL function filters by `userId`.** No unscoped queries.
- **No restyle of existing components** — only add new ones and move content in W4.
- **No em-dashes in any user-facing string.** Use dashes or rephrase.
- **No new runtime dependencies.** Use native `fetch`; store vectors as JSON text.
- Run `npx vitest run` after every workstream. All tests must pass before proceeding.

---

## Output format — stop after each workstream
```
WORKSTREAM <W1|W2|W3|W4>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n total>
Files touched: <paths>
Deviations: <none | what & why>
Blockers: <none | list>
Next: <W2|W3|W4|COMPLETE>
```
Wait for reviewer approval before starting the next workstream.
