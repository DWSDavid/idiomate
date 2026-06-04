# Codex Handoff Prompt — Idiomate MVP

> Paste everything below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
You are the **executant engineer** for **Idiomate**, a local-first English writing-companion app. You implement a pre-written, approved plan exactly. A separate reviewer (Claude) checks your work phase-by-phase. You are a strong generalist developer but assume nothing about this project beyond the two documents named below — read them first.

## Context
- Project root: `D:\dev\idiomate` (git initialized).
- **Read these before coding, in order:**
  1. `docs/superpowers/specs/2026-06-04-idiomate-design.md` — the product spec (what & why).
  2. `docs/superpowers/plans/2026-06-04-idiomate-mvp.md` — the implementation plan (exact files, code, tests, commits). **This is your task list.**
- Stack: Vite + React 18 + TypeScript + TailwindCSS (client); Node + Express (server); `better-sqlite3` (local SQLite); `zod` (validation); `vitest` (tests). LLM = OpenAI HTTP API behind a provider-agnostic `brain/` module.
- The app is **single-user, local-only**. No auth, no cloud.
- Two user-supplied inputs will arrive: (a) a Youdao vocab export `.txt` (**UTF-16LE**, ~9,500 lines) for one-time backfill; (b) the book *中式英语之鉴* (Chinglish) PDF for seeding taxonomy examples. If either is not yet present, proceed and leave the clearly-marked seam noted in the plan.
- **Quick Capture** is the daily vocab path: the user types a new word **or multi-word chunk/phrase/collocation** (+ optional source sentence) → backend enriches it → user edits → saves. Enrichment is **LLM-first (utility model) + Free Dictionary API (`dictionaryapi.dev`) for authoritative IPA**. Cambridge is **not** scraped.
- **Vocab model v2 (dedup + frequency + chunks):** entries are keyed by `normalized` (UNIQUE). Re-capturing bumps `capture_count` instead of duplicating. Priming is **frequency/recency/phrase-weighted** (`getPrimeCandidates`), not random. `kind` marks word/phrase/collocation; phrases & collocations get priority in both prime and nudge. See plan **Task 1.3**.

## Task
Implement the plan **phase by phase, task by task** (Phases 0→6). For each task:
1. Follow the TDD steps in the plan: write the failing test, run it, implement, run until green.
2. Use the **exact file paths, types, and function signatures** given in the plan — they form a cross-file contract.
3. Commit after each task with the message style shown (`feat:`, `chore:`, `feat(api):`, `feat(ui):`, `docs:`).
4. After finishing a phase, **stop and report** (see Output) before starting the next.

## Constraints (non-negotiable — violating any is a failed task)
- **Never auto-fix the user's writing.** The coach returns *annotations* only. The `modelRewrite` field MUST stay hidden in the UI until the user submits their own rewrite. The `CoachPanel` reveal-gate test (Task 5.4) must pass.
- **`brain/` is pure and provider-agnostic.** It must not import Express or React. OpenAI access goes only through the `LLMProvider` interface so the provider can be swapped. All LLM JSON output is validated with the zod schemas — never trust raw model output.
- **The API key never reaches the browser.** Only the Express server reads `OPENAI_API_KEY`.
- **Model tiering:** coaching uses `OPENAI_MODEL_COACH`; prompt-generation/vocab-matching use `OPENAI_MODEL_UTILITY`. Read both from env via `config.ts`.
- **Error profile updates only on session submit**, not on every coach call (see Tasks 4.1 / 1.2).
- **Vocab is deduped on save** (`upsertVocab` ON CONFLICT(normalized) bumps `capture_count`); **priming uses `getPrimeCandidates` (weighted), never `RANDOM()`**; multi-word terms must be saved as `phrase`/`collocation` and prioritized in suggestions.
- **Youdao parser:** the regex in Task 2.1 is a starting point. Tune it against the *real* UTF-16 file until the fixture test passes on genuine entries. If the real format differs from the spec's sample, adjust the parser — do not silently drop entries. If you cannot reliably parse it, STOP and ask the user to paste 6 sample entries.
- **Enrichment (Task 2.2):** LLM output is validated with `enrichZ`; IPA from the dictionary API **wins** over the LLM's when present; the dictionary call is best-effort (network failure must not break capture). Capture is **two-step** — `/capture` previews without saving, `/save` persists after the user edits. Never auto-save un-reviewed enrichment.
- **No placeholders in shipped code.** TDD; DRY; YAGNI; small focused files (the File Structure map is the boundary).
- **Do not build deferred scope:** no speaking, no browser extension, no live news fetch, no SRS, no auth. (Spec §2 Non-Goals.)
- Keep commits frequent and runnable; `npm run dev` must work after Phase 5.

## Output (how to report)
After each phase, post a short status block:
```
PHASE <n> — <name>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n failed> (command: npx vitest run)
Files touched: <paths>
Deviations from plan: <none | what & why>
Blockers/questions for the user or reviewer: <none | list>
Next: Phase <n+1>
```
Then wait for the reviewer's go-ahead before the next phase. If you hit an ambiguity not covered by the spec/plan, ask one concrete question rather than guessing — except for visual/Tailwind styling, where you may use tasteful defaults.
