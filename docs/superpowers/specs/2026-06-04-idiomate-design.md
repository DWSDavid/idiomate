# Idiomate — Design Spec (MVP)

**Date:** 2026-06-04
**Status:** Draft for review
**One-liner:** A private, local-first English **writing companion** for advanced non-native (Chinese L1) writers that refuses to fix your text for you — it names your mistakes, makes you rewrite, tracks your recurring patterns, and pulls your own accumulated vocabulary back into active use.

---

## 1. Problem & Pain (why this exists)

Three real, under-served problems for *advanced* learners:

1. **Fossilization.** At an advanced level, errors are automatic. Tools that fix *for* you (Grammarly et al.) never surface *what* was wrong, *why*, or its *name* — so the same error repeats forever.
2. **Passive ≫ active vocabulary.** The user recognizes thousands of words (daily WSJ/FT/Bloomberg/Axios reading) but reaches for the same ~800 when producing. The accumulation is never activated.
3. **L1 transfer at the mindset/discourse level.** Chinglish (per *The Translator's Guide to Chinglish*, 中式英语之鉴), direct translation, redundancy, over-explanation, non-linear sentence sprawl, weak modality (can/will vs could/would). Almost nothing operationalizes this.

**Value wedge (honest):** Correction tech is a red ocean. Idiomate's differentiation is **pedagogy + persistent memory**, not correction: refuse-to-fix, name-the-error, force-rewrite, track-recurrence, use-your-own-vocab. The app earns its existence over "just paste into ChatGPT" by adding **structure, persistence, and discipline** that raw chat cannot reproduce consistently.

**Audience:** one user (the author) first. Success ≠ a business; success = measurably faster improvement than writing daily + pasting into a chatbot.

---

## 2. Goals / Non-Goals

**Goals (MVP)**
- A dedicated daily practice space: prompt → write → paragraph-by-paragraph coaching.
- A coaching loop that teaches (annotate → you rewrite → compare), never auto-fixes.
- A persistent **error profile** that tags every issue, tallies recurring patterns, and references them.
- **Vocabulary activation**: prime relevant words before writing; nudge opportunistically during review; track activation rate.
- Import the user's Youdao vocab export.

**Non-Goals (explicitly deferred)**
- Speaking practice (secondary; later).
- Browser/editor extension or "in-flow on real writing" mode (later).
- Spaced-repetition system, multi-user/auth, cloud sync.
- Live fetching from FT/WSJ (MVP uses a local prompt bank; live fetch is Phase 2).

---

## 3. Core Interaction — the Coaching Loop

Matches the chosen model: **annotate → you rewrite the whole paragraph → side-by-side compare.**

1. User writes a full draft for the day's prompt — **uninterrupted** (trains linear, finish-the-thought expression).
2. User clicks **"Coach this paragraph."**
3. Backend assembles a prompt from: the paragraph + the user's top recurring error patterns + relevant vocab candidates + Chinglish rule snippets, and calls the LLM. The LLM returns structured `annotations[]`, each `{ span, errorType, hint, explanation, modelRewrite }`.
4. UI shows **only** `span + errorType name + one-line hint`. The `modelRewrite` is **hidden**.
5. User **rewrites the whole paragraph themselves** and submits.
6. UI reveals **side-by-side**: user's rewrite vs the native version, with per-item explanations (why + the named error type).
7. Every `errorType` from the paragraph is written to the DB and feeds the error profile.

**Design note:** the LLM call lives in a provider-agnostic `brain/` module (pure function `assemblePrompt(context) → LLM → structured JSON`). No UI coupling; independently unit-testable; can later be extracted into a reusable Claude/Codex skill.

---

## 4. Error Taxonomy v0 (the differentiating core)

Derived from *中式英语之鉴* (Pinkham) + the user's stated patterns. Locked as **v0 — iterate in use.**

1. **Redundancy / wordiness** — unnecessary words, category nouns (范畴词), synonym stacking
2. **Direct translation / calque** — literal collocations & idioms transferred from Chinese
3. **Over-explanation / over-qualification**
4. **Tense consistency** — mixed/unstable tenses
5. **Modality & register** — can/will vs could/would; hedging, formality
6. **Word order** — adjective/adverb placement, information structure
7. **Sentence sprawl / non-linear** — one sentence carrying too much; topic jumps → split
8. **Small grammar** — articles, prepositions, singular/plural
9. **Word choice / collocation / register mismatch**
10. **Cohesion** — logical connectors, given-new ordering

Each error type carries: a short display name, a one-line "what it is," and a couple of canonical before/after examples (seeded from Pinkham). These power consistent hints and explanations.

---

## 5. Vocabulary Activation

- **Prime (pre-writing):** given the day's topic, select 3–5 relevant words from the user's `vocab` table and challenge the user to work them in.
- **Nudge (during review):** when a paragraph has a spot where a user-vocab word fits naturally, emit a suggestion annotation ("you could use X here") — **suggest, never auto-replace**; the user chooses.
- **Track:** `times_suggested` and `times_used` per word → an "activation rate" the user can see.

---

## 6. Daily Prompt

- Theme mix: **finance/tech dominant + occasional professional/workplace.**
- MVP: a **local prompt bank** (curated + LLM-generated on demand), tagged by theme.
- Phase 2: pull live headlines from the user's sources (FT/WSJ/Bloomberg/Axios/Rundown AI).

---

## 7. Architecture

Single local repo, `npm run dev`, **local-only** (privacy-aligned).

- **Frontend:** Vite + React + TypeScript + Tailwind.
- **Backend:** thin Node/Express layer holding `OPENAI_API_KEY`, proxying LLM calls (key never reaches the browser).
- **Storage:** SQLite via `better-sqlite3` — vocab, drafts, annotations, error tallies, prompts all on the user's machine.
- **Brain:** `brain/` provider-agnostic module behind an `LLMProvider` interface.
  - **Provider:** OpenAI. **Model tiering** for cost: a strong general model (GPT-4o / 4.1 class) for the **coaching** step (nuanced rewrites + explanations); a cheap **mini** model for utility tasks (prompt generation, vocab matching).
  - Swappable to Claude/other by implementing the same interface.

### Data flow
```
Daily prompt (bank) ──▶ Write surface ──▶ "Coach paragraph"
        │                                        │
        ▼                                        ▼
   Vocab prime (3-5)                  brain.assemblePrompt(
                                        paragraph,
                                        top error patterns,
                                        vocab candidates,
                                        Pinkham rule snippets )
                                                 │
                                                 ▼
                                       OpenAI ─▶ annotations[]
                                                 │
                          UI hides modelRewrite; shows name+hint
                                                 │
                              user rewrites paragraph ─▶ submit
                                                 │
                              reveal side-by-side + explanations
                                                 │
                              persist errorTypes ─▶ error profile
```

---

## 8. Data Model (SQLite)

- `vocab(id, word, ipa, def_cn, pos, status, source, date_added, times_suggested, times_used)`
- `prompts(id, date, theme, text, source_url?)`
- `sessions(id, date, prompt_id, draft_text, final_text, duration_s)`
- `annotations(id, session_id, paragraph_idx, span_text, error_type, hint, explanation, model_rewrite, user_rewrite, accepted)`
- `error_tally(error_type, count, last_seen, trend)`  ← derived; powers the dashboard & the "this is your #N recurring pattern" reference

**Vocab import:** a parser for the Youdao `.txt` export — **UTF-16 encoded**, structured as `序号, word [IPA] 释义 + n./v. 中文定义 + 熟练度标记` (~9,500 lines in the sample). Must handle the encoding and that layout.

---

## 9. MVP Scope Boundary

**In:** daily prompt (mixed finance/tech), write surface, coaching loop (annotate→rewrite→compare), vocab prime + opportunistic nudge, error profile + simple dashboard, Youdao txt importer.

**Out (later):** speaking; browser/editor extension; in-flow real-writing mode; SRS; multi-user/auth; cloud sync; live news fetch.

---

## 10. Success Criteria

- The loop never reveals the model rewrite before the user submits their own.
- Every coached paragraph produces tagged error types that accumulate into a visible recurring-pattern profile.
- Vocab activation rate is measurable and trends up over weeks.
- The author actually uses it daily (habit ride-along on existing reading).
- Subjectively: writing that "doesn't read translated."

---

## 11. Open Items

- Locate the *中式英语之鉴* PDF to extract seed rules/examples into the error taxonomy.
- Confirm OpenAI model picks once the API key is in place (cost/quality calibration).
- Vocab export: the user will re-export the current Youdao list for import.

---

## 12. Build Workflow

Vibe-coded: **Claude = brainstormer/architect & reviewer**, **Codex = executant**. This spec → a Codex handoff prompt (Role / Context / Task / Constraints / Output) → implementation → Claude reviews/accepts → iterate.
