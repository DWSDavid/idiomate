# Codex Handoff Prompt - Idiomate v1.2 P2 (W7 + W8)

> Paste below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
You are the executant engineer for Idiomate v1.2 P2. Implement the approved plan exactly, TDD, commit per workstream. A reviewer (Claude) checks each. Read the named docs first.

## Context
- Project root: `D:\dev\idiomate` (git; v1.0, v1.1, and v1.2 P0+P1 already shipped and reviewed).
- Read first: `docs/superpowers/plans/2026-06-05-idiomate-v1.2.md` (the **P2** section is your task list this round).
- Stack: Vite + React + TS + Tailwind (client); Node + Express; better-sqlite3; zod; vitest; OpenAI (gpt-4o). Provider-agnostic `brain/`.
- The data layer already records every mistake (`annotations` joined to `sessions.date`) and `error_tally`. Vocab already deduplicates on save: `upsertVocab` does `ON CONFLICT(normalized) DO UPDATE capture_count = capture_count + excluded.capture_count`, and `getPrimeCandidates` weights `capture_count` heavily. So "re-adding an existing word raises its priority" ALREADY works - this round makes it visible, it does NOT change the scoring.

## Task - build W7 then W8 (skip W9 entirely)

**W7 - Progress tracker.**
- DAL `getDailyMistakeCounts(db, days=30)` -> `[{date, count}]` (annotations excluding `vocab_suggestion`, grouped by the day of `sessions.date`, last N days, ascending).
- DAL `getMistakeTrend(db, days=30, topN=3)` -> for the top `topN` error types overall, per-day counts.
- `GET /api/progress` -> `{ daily, trend }`.
- A plain, functional client "Progress" panel rendering the daily counts + per-top-type counts over time.
- Tests: seeded sessions on different dates bucket correctly; trend returns the top types.

**W8 - My vocabulary view + visible re-capture priority.**
- DAL `getVocabList(db, limit=200)` ordered by the SAME priority score as `getPrimeCandidates`, returning `word, kind, defCn, captureCount, timesSuggested, timesUsed, lastCaptured`; plus `getVocabCount(db)`.
- `GET /api/vocab/list?limit=` -> `{ total, items }`.
- Change `POST /api/vocab/save` to return `{ id, captureCount, existed }` (existed = the normalized term already existed before this save). Do NOT change the scoring or the upsert math.
- Client `CaptureWord`: when `existed` is true, show "Already in your list - met {captureCount} times, priority raised."
- A plain, functional client "My vocabulary (N)" panel: items sorted by priority, each showing word, kind, gloss, a "met {captureCount}x" badge, and used/suggested counts.
- Tests: `getVocabList` ranks a high-`capture_count` word above a fresh one; saving an existing normalized term returns `existed: true` with an incremented `captureCount`.

## Constraints (non-negotiable)
- `server/` + `shared/` is your primary area. For W7/W8 you MAY add **plain, functional** client panels to exercise the new endpoints (correctness over polish) - the reviewer owns all styling and will restyle later with the taste skill. Do not restyle or refactor existing client components beyond wiring in the two new panels.
- Reuse the existing priority scoring (`getPrimeCandidates`) for vocab ordering; do not invent a second ranking. Do not change the upsert/capture_count math.
- Reveal-gate and all prior constraints still hold. brain/ stays provider/framework-agnostic. Validate any LLM JSON with zod (W7/W8 are DB-derived, so likely no LLM calls).
- No placeholders; DRY/YAGNI/TDD; frequent commits; small focused files. No em-dashes in user-facing strings.
- Do NOT build W9 (UI theme customization) this round.

## Output - report after each workstream
```
WORKSTREAM <W7|W8>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n failed> (npx vitest run)
Files touched: <paths>
Deviations from plan: <none | what & why>
Blockers/questions: <none | list>
Next: <id>
```
Stop after each workstream and wait for the reviewer.
