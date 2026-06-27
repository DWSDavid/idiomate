# Idiomate v2.1 — Word Intelligence Layer

## Context

Idiomate is a professional-English writing coach (Vite+React+TS client; Node+Express server; better-sqlite3). All user state flows through `x-user-id` (UUID from localStorage). OpenAI is accessed via `deps.llm` (LLMProvider interface).

**Branch:** Create a new branch `codex/idiomate-vocab-network-v2.1` from `codex/idiomate-sentence-lab-v1.4` and work there.

**What already exists — do NOT re-implement:**
- `deepDiveWord()` in `server/src/brain/enrich.ts` — returns `{ wordFamily, nearSynonyms, usageExamples }`
- `GET /api/vocab/:id/deep-dive` in `server/src/routes/vocab.ts` — cache-first (stores in `word_family` / `near_synonyms` columns)
- `WordDeepDivePanel.tsx` — displayed via the "Details" button in VocabularyPanel
- `word_family TEXT` and `near_synonyms TEXT` columns on the `vocab` table
- `UNIQUE(user_id, normalized)` constraint — deduplication on exact lowercase form

---

## Target: Four workstreams

### W1 — Base-form dedup at capture time (server only)

**Problem:** Adding "fortunes" and "fortune" creates two separate vocab entries because their `normalized` forms differ ("fortunes" vs "fortune"). We need lemma-level deduplication.

**1. `server/src/brain/schema.ts`**
Add `baseForm: tolerantOptionalString` to `enrichedVocabZ`.
(`tolerantOptionalString` already exists on line 41.)

**2. `server/src/brain/enrich.ts`**

In both `enrichWord()` and `translateChineseVocab()`, update the system prompt to include:
```
baseForm: the canonical dictionary headword / lemma for this word. Always lowercase.
Examples: "fortunes" → "fortune", "faltering" → "falter", "beautifully" → "beautiful",
"ran" → "run". For a phrase or collocation, baseForm equals its normalized form.
```
Add `baseForm` to the returned `Vocab` object (pass it through from parsed result).

**3. `server/src/db/db.ts`**
In `migrate()`, after the existing `ensureColumn` calls, add:
```ts
ensureColumn(db, 'vocab', 'base_form', 'TEXT');
```

**4. `server/src/db/dal.ts`**

Update `VocabRow` interface: add `base_form: string | null`.

Update `vocabParams()` to include `base_form: vocab.baseForm ?? null`.

Update `mapVocab()` to include `baseForm: row.base_form ?? undefined` on the returned `Vocab` object.

Add `baseForm?: string` to `Vocab` in `shared/types.ts`.

**Key logic change — family dedup before insert:**

In `insertVocab()` (and/or `upsertVocab()`), before the INSERT, run:
```sql
SELECT id, capture_count, last_captured FROM vocab
WHERE user_id = ? AND (base_form = ? OR normalized = ?)
AND id != COALESCE((SELECT id FROM vocab WHERE user_id = ? AND normalized = ?), -1)
LIMIT 1
```
with `(userId, incomingBaseForm, incomingBaseForm, userId, incomingNormalized)`.

If a row is found (family already exists), instead of inserting:
```sql
UPDATE vocab SET capture_count = capture_count + 1, last_captured = datetime('now') WHERE id = ?
```
Return `{ id: existingId, captureCount: existingCount + 1, existed: true }`.

If no existing row, do the normal INSERT. `SaveVocabResponse` in `shared/types.ts` already has `existed: boolean`.

**Note:** The `UNIQUE(user_id, normalized)` constraint is a safety net for exact-form dedup; the `base_form` lookup above handles cross-inflection dedup. Both must fire.

**5. `server/src/routes/vocab.ts`**

No changes needed in routes — the dedup happens inside `insertVocab` / `upsertVocab`.

**Tests (add to `server/tests/api.test.ts`):**
- Capture "fortunes"; then capture "fortune" → second call returns `{ existed: true, captureCount: 2 }` and `SELECT COUNT(*) FROM vocab` is still 1.
- Capture "run"; then capture "running" → same dedup behaviour.
- Check `base_form` column is set correctly via a direct DB query in the DAL test.

---

### W2 — Enriched post-capture card: example sentence + role + synonyms (server + client)

**Problem:** After adding a word, the user sees only a generic "Saved!" message. They want immediate intelligence: an example sentence with the captured word highlighted, its grammatical role, and near-synonyms.

#### 2a. Structured usage examples with grammatical roles (server)

**`server/src/brain/schema.ts`**

Add a new schema alongside the existing `wordDeepDiveZ`:
```ts
export const usageExampleRichZ = z.object({
  sentence: z.string().min(1),
  role: z.string().min(1), // e.g. "noun as direct object", "verb as main predicate"
});

export const wordDeepDiveZ = z.object({
  wordFamily: z.array(z.string().min(1)).min(1).max(12),
  nearSynonyms: z.array(nearSynonymZ).max(4).optional().catch(undefined),
  usageExamples: z.array(z.string().min(1)).min(1).max(3),
  usageExamplesRich: z.array(usageExampleRichZ).min(1).max(3).optional().catch(undefined),
});
export type UsageExampleRich = z.infer<typeof usageExampleRichZ>;
export type WordDeepDive = z.infer<typeof wordDeepDiveZ>;
```

**`server/src/brain/enrich.ts` — `deepDiveWord()`**

Update the system prompt to also request `usageExamplesRich`:
```
usageExamplesRich: same 3 sentences as usageExamples but as objects:
{ sentence: string, role: string }
where role describes the grammatical function of the target word in that sentence,
e.g. "noun as subject", "verb as main predicate", "adjective modifying 'approach'",
"adverb modifying 'executed'", "noun as object of preposition 'on'".
Be specific — name the word it modifies when it is an adjective or adverb.
```

Keep `usageExamples` in the schema for backwards compatibility (parse it from `usageExamplesRich` if missing, or vice versa).

#### 2b. `WordIntelCard` component (client)

**`client/src/components/WordIntelCard.tsx`** (new file)

Props:
```ts
interface WordIntelCardProps {
  word: string;
  wordFamily: string[];
  usageExamplesRich?: Array<{ sentence: string; role: string }>;
  usageExamples?: string[];
  nearSynonyms?: Array<{ word: string; distinction: string }>;
  onDismiss: () => void;
}
```

Rendering order:
1. **Example sentence with highlight** — take `usageExamplesRich[0].sentence` (fallback `usageExamples[0]`). Find the first token from `wordFamily` that appears in the sentence (case-insensitive). Split the sentence on that match and render `before + <mark class="vocab-highlight">match</mark> + after`. Use a helper function `highlightSentence(sentence: string, family: string[]): ReactNode`.

2. **Role chip** — if `usageExamplesRich[0].role` exists, show it as `<span className="chip chip-slate">{role}</span>`.

3. **Near-synonym list** — render each `nearSynonyms[i]` as a card row: `<strong>{word}</strong> — {distinction}`. Max 3.

4. **Dismiss button** — `<button className="btn-ghost text-xs" onClick={onDismiss}>Got it</button>`

The `highlightSentence` helper:
```ts
function highlightSentence(sentence: string, family: string[]): React.ReactNode {
  // Sort family by length descending to match longer forms first
  const sorted = [...family].sort((a, b) => b.length - a.length);
  for (const form of sorted) {
    const idx = sentence.toLowerCase().indexOf(form.toLowerCase());
    if (idx === -1) continue;
    return (
      <>
        {sentence.slice(0, idx)}
        <mark className="vocab-highlight">{sentence.slice(idx, idx + form.length)}</mark>
        {sentence.slice(idx + form.length)}
      </>
    );
  }
  return sentence; // no match found, return plain
}
```

Add CSS in `client/src/styles.css`:
```css
.vocab-highlight {
  @apply rounded bg-amber-100 px-0.5 font-semibold text-amber-800 not-italic;
}
```

#### 2c. Wire into `CaptureWord.tsx`

After a successful save (inside the `handleSubmit` or `handleSave` success branch), auto-fetch the deep dive:
```ts
const [intelCard, setIntelCard] = useState<WordDeepDive & { word: string } | null>(null);

// After save succeeds:
const savedId = response.id;
const savedWord = enriched.word; // the word that was saved
// fire-and-forget: don't block the success state
fetch(`/api/vocab/${savedId}/deep-dive`, { headers: { 'x-user-id': userId } })
  .then(r => r.json())
  .then(data => setIntelCard({ ...data, word: savedWord }))
  .catch(() => undefined); // silently ignore
```

Render `<WordIntelCard>` below the success message when `intelCard !== null`. Clear it when the user starts a new capture (when the word input changes).

**Tests (`client/tests/wordIntelCard.test.tsx`, new file):**
- Renders example sentence with the matched family word in a `<mark>`.
- Falls back gracefully when `nearSynonyms` is empty or `usageExamplesRich` is absent.
- `onDismiss` is called when the "Got it" button is clicked.
- `highlightSentence` matches the longest family form first.

---

### W3 — Vocab family merge endpoint (server + small UI hook)

**Problem:** The existing vocab list may already contain inflected duplicates ("fortune" + "fortunes") captured before W1 was in place. A one-time merge endpoint cleans this up.

#### 3a. DAL function

**`server/src/db/dal.ts`**

New function:
```ts
export function mergeVocabFamilies(db: Database.Database, userId: string): { merged: number } {
  // Load all vocab for this user
  const rows = db.prepare(
    'SELECT id, normalized, base_form, word_family, capture_count, last_captured FROM vocab WHERE user_id = ?'
  ).all(userId) as Array<Pick<VocabRow, 'id' | 'normalized' | 'base_form' | 'word_family' | 'capture_count' | 'last_captured'>>;

  let merged = 0;
  const toDelete = new Set<number>();

  for (const primary of rows) {
    if (toDelete.has(primary.id)) continue;
    const family: string[] = primary.word_family ? JSON.parse(primary.word_family) : [];

    for (const secondary of rows) {
      if (secondary.id === primary.id) continue;
      if (toDelete.has(secondary.id)) continue;
      if (!family.includes(secondary.normalized) && !family.includes(secondary.base_form ?? '')) continue;

      // Merge secondary into primary: add its capture_count, keep the later last_captured
      db.prepare(`
        UPDATE vocab SET
          capture_count = capture_count + ?,
          last_captured = CASE WHEN last_captured < ? THEN ? ELSE last_captured END
        WHERE id = ?
      `).run(secondary.capture_count, secondary.last_captured, secondary.last_captured, primary.id);

      toDelete.add(secondary.id);
      merged++;
    }
  }

  if (toDelete.size > 0) {
    const placeholders = Array.from(toDelete).map(() => '?').join(',');
    db.prepare(`DELETE FROM vocab WHERE id IN (${placeholders})`).run(...toDelete);
  }

  return { merged };
}
```

#### 3b. Route

**`server/src/routes/vocab.ts`**

Add after existing routes:
```ts
router.post('/merge-families', (req, res) => {
  const result = mergeVocabFamilies(deps.db, req.userId);
  res.json(result);
});
```

Import `mergeVocabFamilies` from dal.

#### 3c. UI button

In **`client/src/components/VocabularyPanel.tsx`**, add a small "Merge families" button next to "Open/Close vocabulary". On click, `POST /api/vocab/merge-families`, then call `onRefresh()` (pass a refresh trigger prop, or reuse the existing `refreshKey` mechanism by calling a parent-provided callback).

Alternatively — since VocabularyPanel already receives `refreshKey` — add the button inside the panel header and call `fetch('/api/vocab/merge-families', { method: 'POST', ... })` then increment a local state that triggers re-fetch.

Button only visible when `vocab.total > 0` and status is `'idle'`.

**Tests (add to `server/tests/api.test.ts`):**
- Insert "fortune" and "fortunes" (with word_family of "fortune" containing "fortunes") for the same user.
- `POST /api/vocab/merge-families` → `{ merged: 1 }` and only 1 row remains with summed capture_count.
- Idempotent: calling again → `{ merged: 0 }`.

---

### W4 — Semantic clusters view (client only)

**Problem:** Words with shared near-synonyms should be visually grouped so the user can see their vocabulary network (e.g., remedy ≈ solution ≈ fix).

**Prerequisite:** `VocabListItem` must include `nearSynonyms` and `pos`. Update in `shared/types.ts`:
```ts
export interface VocabListItem {
  id: number;
  word: string;
  kind: VocabKind;
  pos?: string;
  defCn?: string;
  captureCount: number;
  timesSuggested: number;
  timesUsed: number;
  lastCaptured?: string;
  capturedDate?: string;
  nearSynonyms?: Array<{ word: string; distinction: string }>;
}
```

In `server/src/db/dal.ts`, update `mapVocab` to parse `near_synonyms` JSON and include it on `VocabListItem`. Also expose `pos`.

In `server/src/routes/vocab.ts`, the `/list` route calls `getVocabList()` which uses `mapVocab` — no route change needed.

#### `VocabNetworkPanel.tsx` (new component)

```ts
interface VocabNetworkPanelProps {
  items: VocabListItem[];
}
```

Cluster algorithm (client-side, pure function, no API call):
```ts
function buildClusters(items: VocabListItem[]): Array<Set<string>> {
  const wordSet = new Set(items.map(i => i.word.toLowerCase()));
  const clusters: Array<Set<string>> = [];

  for (const item of items) {
    if (!item.nearSynonyms?.length) continue;
    const synonymWords = item.nearSynonyms
      .map(s => s.word.toLowerCase())
      .filter(w => wordSet.has(w)); // only synonyms that are in user's vocab
    if (!synonymWords.length) continue;

    // Find or create cluster containing this word
    let targetCluster = clusters.find(c => c.has(item.word.toLowerCase()));
    if (!targetCluster) {
      targetCluster = new Set([item.word.toLowerCase()]);
      clusters.push(targetCluster);
    }
    for (const s of synonymWords) targetCluster.add(s);
  }

  // Filter out singleton clusters and deduplicate
  return clusters.filter(c => c.size > 1);
}
```

Rendering: show section "Semantic connections" only when `clusters.length > 0`. Each cluster renders as a horizontal row of chips joined by `≈`:
```tsx
<div className="flex flex-wrap items-center gap-1">
  {[...cluster].map((word, i) => (
    <React.Fragment key={word}>
      <span className="chip">{word}</span>
      {i < cluster.size - 1 && <span className="text-xs text-slate-400">≈</span>}
    </React.Fragment>
  ))}
</div>
```

**Integration:** In `App.tsx`, pass `vocab.items` down to `<VocabNetworkPanel items={vocab.items} />` rendered inside the Words tab section, below `<VocabularyPanel>`. Or render it inside VocabularyPanel itself at the bottom.

**Tests (`client/tests/vocabNetworkPanel.test.tsx`, new file):**
- Two items with overlapping near-synonyms both in the list → rendered as one cluster.
- A near-synonym that is NOT in the user's vocab list is excluded from the cluster.
- No "Semantic connections" section when no clusters exist.

---

## CSS additions (`client/src/styles.css`)

```css
.vocab-highlight {
  @apply rounded bg-amber-100 px-0.5 font-semibold text-amber-800 not-italic;
}
```

---

## Shared types summary of changes (`shared/types.ts`)

```ts
// Add to Vocab:
baseForm?: string;

// Update VocabListItem:
pos?: string;
nearSynonyms?: Array<{ word: string; distinction: string }>;
```

---

## Testing requirements

Run `npx vitest run` — all existing 136 tests must still pass. New tests to add:

| File | What it tests |
|------|---------------|
| `server/tests/api.test.ts` | Base-form dedup (fortunes+fortune → 1 row), merge-families endpoint, idempotency |
| `server/tests/dal.test.ts` | `mergeVocabFamilies()` directly, `base_form` column populated |
| `client/tests/wordIntelCard.test.tsx` | Highlight rendering, role chip, dismiss, graceful fallback |
| `client/tests/vocabNetworkPanel.test.tsx` | Cluster algorithm, vocab-only filtering, empty state |

---

## Deploy

After all tests pass:
```bash
git checkout codex/idiomate-sentence-lab-v1.4
git merge --ff-only codex/idiomate-vocab-network-v2.1
git push origin codex/idiomate-sentence-lab-v1.4
```

Render (autoDeploy: true on that branch) will pick it up automatically.

---

## Implementation order

W1 first (server-only, touches dal + schema + enrich), then W2 (depends on W1's saved id), then W3 (depends on W1's word_family data), then W4 (depends on shared types update from W3).
