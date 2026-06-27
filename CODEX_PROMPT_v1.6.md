# Codex Handoff Prompt - Idiomate v1.6 (review loop + startup fix)

> Paste below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
Executant engineer for Idiomate v1.6. Close the vocab learning loop: capture exists, but there is no review mechanism, no daily habit trigger, and no way to surface old words. Build the three workstreams below in order. TDD throughout; commit after each workstream; stop and report before moving to the next.

## Context
- Project root: `D:\dev\idiomate`. Stack: Vite + React + TS + Tailwind client; Node + Express server; better-sqlite3; zod; vitest; OpenAI (gpt-4o).
- Auth: `x-user-id` header (set by client from localStorage UUID); `x-access-code` header when env set.
- Vocab table already has: `word, normalized, kind, pos, ipa, def_cn, pos, context_sentence, examples, collocations, register, capture_count, last_captured, times_suggested, times_used, source, ease`.
- Read `shared/types.ts` and `server/src/db/dal.ts` before touching any schema or DAL.
- All existing tests must stay green. Run `npx vitest run` to verify after each workstream.

## Workstream S1 — One-click startup (small, do first)

**Goal:** `npm run dev` auto-opens the browser. No manual `localhost:5173`.

1. In `client/vite.config.ts`, add `server: { open: true }` to the Vite config object.
2. Create `start.bat` in the project root:
   ```bat
   @echo off
   cd /d %~dp0
   npm run dev
   ```
   This lets the user double-click `start.bat` and the whole stack starts + browser opens automatically.
3. No tests needed for this workstream — just verify `npx vitest run` still passes.

## Workstream S2 — DB: review columns + DAL + API (medium)

**Goal:** Track review state per vocab item per user. Expose a review endpoint.

### 2a. Migration
Add to the migration in `server/src/db/db.ts` (append after the last `ALTER TABLE` or inside the versioned migration block — match the existing pattern exactly):
```sql
ALTER TABLE vocab ADD COLUMN ease TEXT DEFAULT 'new' CHECK(ease IN ('new','hard','easy'));
ALTER TABLE vocab ADD COLUMN last_reviewed TEXT;
```
`ease` values: `'new'` (never reviewed), `'hard'` (reviewed but struggled), `'easy'` (recalled confidently).

### 2b. Shared type
In `shared/types.ts`, add to the `Vocab` interface:
```ts
ease?: 'new' | 'hard' | 'easy';
lastReviewed?: string;
```

### 2c. DAL — `getReviewQueue`
In `server/src/db/dal.ts`, export a new function:
```ts
export function getReviewQueue(db: Database.Database, userId: string, limit = 10): Vocab[]
```
SQL logic — order rows so the user always sees the highest-value cards first:
```sql
SELECT * FROM vocab
WHERE user_id = ?
ORDER BY
  CASE ease
    WHEN 'new'  THEN 0
    WHEN 'hard' THEN 1
    WHEN 'easy' THEN 2
  END ASC,
  CASE
    WHEN ease = 'easy' THEN last_reviewed   -- oldest-reviewed easy cards first
    ELSE last_captured                       -- most-recently captured for new/hard
  END DESC
LIMIT ?
```
Map rows through the existing `mapVocab` helper (add `ease` and `lastReviewed` to it).

### 2d. DAL — `recordReview`
```ts
export function recordReview(
  db: Database.Database,
  userId: string,
  vocabId: number,
  ease: 'easy' | 'hard',
): void
```
```sql
UPDATE vocab
SET ease = ?, last_reviewed = datetime('now')
WHERE id = ? AND user_id = ?
```

### 2e. API route
In `server/src/routes/vocab.ts`, add two routes inside `createVocabRouter`:

```
GET  /api/vocab/review-queue          → { items: Vocab[] }   (limit=10)
POST /api/vocab/:id/review            body: { ease: 'easy'|'hard' }  → 204
```

Validate the POST body with zod: `z.object({ ease: z.enum(['easy','hard']) })`. Return 404 if the row doesn't belong to `req.userId`.

### 2f. Client API functions
In `client/src/api.ts`, add:
```ts
export function getReviewQueue(): Promise<{ items: Vocab[] }>
export function recordReview(id: number, ease: 'easy' | 'hard'): Promise<void>
```

### 2g. Tests
In `server/tests/api.test.ts`, add:
- `GET /api/vocab/review-queue returns up to 10 vocab items ordered new→hard→easy` — seed 3 new + 2 hard + 2 easy items, assert ordering.
- `POST /api/vocab/:id/review updates ease and last_reviewed` — assert 204, assert DB row changed.
- `POST /api/vocab/:id/review returns 404 for another user's word` — assert isolation.

## Workstream S3 — Review tab UI (medium)

**Goal:** A dedicated "Review" tab with flashcard interaction.

### 3a. Tab
Add a "Review" tab to the existing tab navigation in `client/src/App.tsx` (match the current tab pattern exactly — do not restyle existing tabs).

### 3b. `ReviewPanel` component
Create `client/src/components/ReviewPanel.tsx`.

**States:**
- `loading` — fetching the queue
- `empty` — no vocab yet (`items.length === 0`)
- `active` — showing a card
- `done` — finished the queue (show summary)

**Card interaction (one card at a time):**
1. **Hidden face** — shows the English `word` + `pos` chip + `kind` chip. A "Reveal" button.
2. **Revealed face** — adds `defCn`, `examples` (first 2), `collocations` (first 2). Two buttons: **"Got it ✓"** (ease `'easy'`) and **"Again ↺"** (ease `'hard'`). Both call `recordReview`, then advance to the next card.
3. Progress indicator: `3 / 10` above the card.

**Summary screen (all cards done):**
- Show count: "You knew X of Y."
- Two buttons: "Review more" (refetch queue) and "Go write" (switch to Writing tab — call a prop `onGoWrite: () => void`).

**Empty state:**
- "Capture some words first — they'll appear here for review."

**Styling:** use existing CSS classes (`surface`, `btn-primary`, `chip`, `chip-slate`, `chip-blue`, `field-label`, `section-label`). Do not introduce new Tailwind utility classes that aren't already in `styles.css`; add to `styles.css` only if genuinely needed. No inline styles.

### 3c. Tests
In `client/tests/reviewPanel.test.tsx`:
- Renders cards one at a time; clicking "Reveal" shows the definition.
- Clicking "Got it" calls `recordReview(id, 'easy')` and advances to the next card.
- Clicking "Again" calls `recordReview(id, 'hard')` and advances.
- After the last card, shows the summary screen.
- "Go write" calls `onGoWrite`.
- Empty state renders when `items` is empty.

## Workstream S4 — Today's captures strip (small)

**Goal:** Surface words captured today directly on the Writing tab so the user sees what to use.

### 4a. API
In `server/src/routes/vocab.ts`, add:
```
GET /api/vocab/today   → { items: Vocab[] }
```
SQL: `WHERE user_id = ? AND date(last_captured) = date('now') ORDER BY last_captured DESC LIMIT 20`.

In `client/src/api.ts`, add `getTodayVocab(): Promise<{ items: Vocab[] }>`.

### 4b. `TodayStrip` component
Create `client/src/components/TodayStrip.tsx`.

- Fetches on mount; refetches when a vocab is saved (accept an optional `refreshKey: number` prop, same pattern as `VocabPrime`).
- If no words today: render nothing (return `null`).
- If words exist: render a compact horizontal strip at the top of the Writing tab (above `VocabPrime`), showing up to 5 word chips:
  ```
  Today  [margin pressure] [rat race] [capital expenditure]  +2 more
  ```
  Each chip is `chip chip-blue`. "+N more" only if >5. No click action needed.
- Label: `"Today"` in `section-label` style, inline before the chips.

### 4c. Placement
In `client/src/App.tsx`, render `<TodayStrip refreshKey={vocabRefreshKey} />` at the top of the Writing tab content, above `<VocabPrime>`. Wire `refreshKey` to the same counter used by `VocabPrime` (already incremented when vocab is saved — if no such counter exists, add one and thread it through `ChineseToVocabBox` and `CaptureWord` `onSaved` callbacks).

### 4d. Tests
In `client/tests/todayStrip.test.tsx`:
- Renders word chips when today's vocab exists.
- Shows "+N more" when more than 5 words.
- Renders nothing when today list is empty.

## Constraints (non-negotiable)
- `mapVocab` in `dal.ts` must include `ease` and `lastReviewed` — any query returning a `Vocab` must map both fields.
- Every new DAL function must filter by `userId` — no unscoped queries.
- No restyle of existing UI. Only add new components and the Review tab.
- No placeholder implementations; complete each workstream fully before committing.
- Run `npx vitest run` after each workstream; all tests must pass before moving to the next.
- No em-dashes in any user-facing string.

## Output format — report after each workstream, then stop
```
WORKSTREAM <S1|S2|S3|S4>: DONE
Commits: <hashes + one-line subjects>
Tests: <n passed / n total> (npx vitest run)
Files touched: <paths>
Deviations: <none | what & why>
Blockers: <none | list>
Next: <S2|S3|S4|COMPLETE>
```
Wait for reviewer approval before starting the next workstream.
