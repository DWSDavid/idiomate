# Idiomate v2.2 — Writing Context Layer

## Branch
Create `codex/idiomate-writing-context-v2.2` from `codex/idiomate-sentence-lab-v1.4`.

## What already exists — do NOT re-implement
- `GET /api/vocab/prime?promptText=&limit=` — returns top vocab items for a prompt topic
- `VocabPrime.tsx` — already rendered in Write tab rail, shows word + POS + defCn
- `GET /api/prompt/today` — returns today's daily prompt
- `TodayStrip.tsx` — shows today's captured words as chips (no definitions)
- `getReviewQueue` in dal.ts + `GET /api/vocab/review-queue` — exists and correct
- `ReviewPanel.tsx` — works when server is running

---

## W1 — Smarter daily prompts (server)

**Problem:** Current prompts are too broad ("What's your view on geopolitical tensions and international sporting events?"). Users can't answer them naturally in a short paragraph.

**Goal:** Shorter, more specific, opinion-or-story prompts that a user can answer in 3–5 sentences about a real experience or concrete opinion.

**`server/src/brain/prompts.ts`** — update `generateDailyPrompt()` system prompt:

Replace current system prompt with:
```
You generate a daily English writing prompt for a professional Chinese learner practicing business and editorial writing.

Rules:
- Maximum 25 words for the prompt question itself.
- Concrete and specific: name an industry, technology, company type, or real scenario.
- Opinion OR story format: either "Do you think X?" / "Would you rather X?" or "Describe a time when X."
- Answerable in 3–5 sentences by someone working in tech, finance, or startups.
- Avoid geopolitics, sports diplomacy, or abstract philosophy.
- Theme must be one of: tech, finance, startups, career, productivity, communication, leadership.

Return JSON: { "date": "YYYY-MM-DD", "theme": "...", "text": "..." }
```

No other changes needed — the route and schema are already correct.

---

## W2 — News context alongside the prompt (server + client)

**Problem:** User wants to see 3 recent news headlines related to today's prompt theme, as writing material.

### 2a. News fetch (server)

The app already has a `NewsItem` type in `shared/types.ts` (`{ title, link, source? }`). Use it.

**`server/src/brain/news.ts`** (already exists — check its current implementation before modifying).

Add a new function `fetchThemeNews(theme: string, model: string, provider: LLMProvider): Promise<NewsItem[]>`:
- Call the LLM with a system prompt asking it to return 3 recent, real news items related to the theme.
- The LLM should return JSON: `{ items: [{ title, link, source }] }`.
- Return the items, or `[]` on any error.
- Cap at 3 items.

**`server/src/routes/prompt.ts`** (or wherever `GET /api/prompt/today` lives):
- After generating/returning the prompt, also return `newsItems` alongside it.
- Updated response shape: `{ date, theme, text, newsItems: NewsItem[] }`
- Generate news async: call `fetchThemeNews(theme)` and include results. If it fails, return `newsItems: []`.

Update `Prompt` interface in `shared/types.ts` to add `newsItems?: NewsItem[]`.

### 2b. News display (client)

**`client/src/components/DailyPrompt.tsx`** — currently shows just the prompt text. Add a "For context" section below the prompt text showing the news items as a list:

```tsx
{prompt.newsItems?.length ? (
  <div className="mt-4">
    <p className="section-label">For context</p>
    <ul className="mt-2 space-y-2">
      {prompt.newsItems.map(item => (
        <li key={item.link} className="text-sm leading-6">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-800 hover:text-violet-700 underline-offset-2 hover:underline"
          >
            {item.title}
          </a>
          {item.source ? <span className="ml-2 text-xs text-slate-400">{item.source}</span> : null}
        </li>
      ))}
    </ul>
  </div>
) : null}
```

**Tests:**
- `server/tests/prompts.test.ts`: mock LLM to return news items; assert they appear in the prompt route response.
- `client/tests/dailyPrompt.test.tsx` (if it exists, or add assertions to existing prompt test): mock `/api/prompt/today` to return `newsItems`; assert "For context" section renders with the items.

---

## W3 — TodayStrip with definitions on click (client only)

**Problem:** TodayStrip shows word chips for today's captures but with no context — user can't remember what the word means.

**`client/src/components/TodayStrip.tsx`** changes:

Add `expandedId: number | null` state (one expanded at a time).

Each chip becomes a `<button>` that toggles its expanded state:
```tsx
{visible.map(item => (
  <span key={item.id} className="flex flex-col items-start gap-0.5">
    <button
      type="button"
      className="chip chip-blue"
      onClick={() => setExpandedId(prev => prev === item.id ? null : item.id)}
    >
      {item.word}
    </button>
    {expandedId === item.id && (item.defCn || item.pos) ? (
      <span className="text-xs text-slate-500 pl-1">
        {item.pos ? <span className="font-medium">{item.pos}</span> : null}
        {item.pos && item.defCn ? ' · ' : null}
        {item.defCn}
      </span>
    ) : null}
  </span>
))}
```

The `Vocab` type already has `defCn` and `pos` fields. The `getTodayVocab` API and `mapVocab` DAL function already return these. No server changes needed.

**Tests (`client/tests/todayStrip.test.tsx`):**
- Add a test: renders chips; clicking a chip reveals defCn and pos; clicking again hides it; clicking a different chip closes the first.

---

## W4 — Sentence patterns reference tab (client + server)

**Problem:** User wants a reference showing common sentence structures with labeled parts (subject, verb, adjective, adverb) — a grammar scaffold they can use while writing.

### 4a. Static sentence patterns (client only, no API needed)

Create **`client/src/components/SentencePatterns.tsx`** with hardcoded patterns. No LLM call needed — these are stable reference structures for professional English writing.

Pattern structure:
```ts
interface PatternPart {
  text: string;
  role: 'subject' | 'verb' | 'object' | 'adjective' | 'adverb' | 'conjunction' | 'prep-phrase' | 'clause';
  label: string; // Chinese label shown on hover
}
interface SentencePattern {
  id: string;
  name: string;
  formula: string; // e.g. "S + V + O"
  parts: PatternPart[];
  tip: string; // one-line Chinese usage note
}
```

Include these 8 patterns:

1. **Simple assertion** — `S + V + O`  
   Example: `[The company]ˢ [launched]ᵛ [a new product]ᵒ.`  
   Parts: "The company" (subject · 主语), "launched" (verb · 谓语), "a new product" (object · 宾语)  
   Tip: 最基础结构，适合陈述事实

2. **Causal chain** — `S + V + O, which + V + O`  
   Example: `[The decision]ˢ [cut]ᵛ [costs]ᵒ, which [boosted]ᵛ [margins]ᵒ.`  
   Tip: 用 which 引导结果从句，避免堆砌 and

3. **Concession + pivot** — `Although + clause, S + V + O`  
   Example: `[Although]ᶜ [growth slowed]ᶜˡᵃᵘˢᵉ, [the firm]ˢ [maintained]ᵛ [profitability]ᵒ.`  
   Tip: 先承认不利面，再转折，显得客观

4. **Fronted adverb** — `Adv + , + S + V + O`  
   Example: `[Historically]ᵃᵈᵛ, [markets]ˢ [recover]ᵛ [faster than expected]ᵖʳᵉᵖ.`  
   Tip: 副词前置强调时间/方式维度

5. **Subject complement** — `S + linking-V + Adj`  
   Example: `[The outlook]ˢ [remains]ᵛ [uncertain]ᵃᵈʲ.`  
   Tip: remain/become/seem + 形容词，描述状态变化

6. **Parallel list** — `S + V + O₁, O₂, and O₃`  
   Example: `[The strategy]ˢ [prioritises]ᵛ [speed]ᵒ, [cost efficiency]ᵒ, and [scalability]ᵒ.`  
   Tip: 三项并列，结构对称，最后一项最重要

7. **Conditional** — `If + clause, S + would/will + V + O`  
   Example: `[If]ᶜ [demand holds]ᶜˡᵃᵘˢᵉ, [revenue]ˢ [will exceed]ᵛ [targets]ᵒ.`  
   Tip: If 条件句，will 用于现实可能，would 用于假设

8. **Passive emphasis** — `O + be + V(past) + by + Agent`  
   Example: `[The policy]ˢ [was shaped]ᵛ [by a decade of low rates]ᵖʳᵉᵖ.`  
   Tip: 被动语态把结果放句首，强调影响而非施动者

**Rendering:**

Each pattern card:
- Title + formula chip at top
- Sentence with each part wrapped in a colored `<span>` based on role:
  - subject → `bg-blue-100 text-blue-800`
  - verb → `bg-violet-100 text-violet-800`
  - object → `bg-emerald-100 text-emerald-800`
  - adjective → `bg-amber-100 text-amber-800`
  - adverb → `bg-orange-100 text-orange-800`
  - conjunction / clause → `bg-slate-100 text-slate-600`
  - prep-phrase → `bg-rose-100 text-rose-800`
- Each span has a tooltip (title attribute) with the Chinese label
- Tip text below in small slate text

### 4b. Add "Patterns" tab to workspace

In **`App.tsx`**:
- Add `'patterns'` to the `WorkspaceSection` union type
- Add `{ id: 'patterns', label: 'Patterns' }` to `workspaceSections` array
- Add a new section:
```tsx
<section className={`workspace-page${activeSection === 'patterns' ? '' : ' hidden'}`} aria-label="sentence patterns">
  <SentencePatterns />
</section>
```

Import `SentencePatterns` from `./components/SentencePatterns`.

**Tests (`client/tests/sentencePatterns.test.tsx`, new file):**
- Renders all 8 pattern titles.
- Each sentence part renders with correct colour class (spot-check 2–3 patterns).
- Tab is accessible from the workspace nav.

---

## CSS additions

Add role-based colour classes to `client/src/styles.css` if not already present:
```css
.part-subject    { @apply rounded bg-blue-100 px-1 text-blue-800; }
.part-verb       { @apply rounded bg-violet-100 px-1 text-violet-800; }
.part-object     { @apply rounded bg-emerald-100 px-1 text-emerald-800; }
.part-adjective  { @apply rounded bg-amber-100 px-1 text-amber-800; }
.part-adverb     { @apply rounded bg-orange-100 px-1 text-orange-800; }
.part-clause     { @apply rounded bg-slate-100 px-1 text-slate-600; }
.part-prep-phrase{ @apply rounded bg-rose-100 px-1 text-rose-800; }
```

---

## Testing requirements

Run `npx vitest run` — all existing 151 tests must still pass. New tests:

| File | What it covers |
|------|----------------|
| `server/tests/prompts.test.ts` | News items included in prompt response; shorter prompt text (≤ 35 words) |
| `client/tests/dailyPrompt.test.tsx` | "For context" section renders when newsItems present; hidden when empty |
| `client/tests/todayStrip.test.tsx` | Click chip → reveal defCn + pos; click again → hide; click other → swap |
| `client/tests/sentencePatterns.test.tsx` | All 8 patterns render; colour classes present; tab accessible |

---

## Deploy

After all tests pass:
```bash
git checkout codex/idiomate-sentence-lab-v1.4
git merge --ff-only codex/idiomate-writing-context-v2.2
git push origin codex/idiomate-sentence-lab-v1.4
```
