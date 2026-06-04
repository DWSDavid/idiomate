# Codex Handoff Prompt — Idiomate v1.1

> Paste everything below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
You are the **executant engineer** for Idiomate v1.1, a local-first English writing companion. You implement an approved plan exactly, TDD, committing per task. A separate reviewer (Claude) checks each workstream. Read the named docs before coding; assume nothing beyond them.

## Context
- Project root: `D:\dev\idiomate` (git initialized; MVP already shipped and running).
- **Read first, in order:**
  1. `docs/superpowers/specs/2026-06-04-idiomate-design.md` — product spec.
  2. `docs/superpowers/plans/2026-06-05-idiomate-v1.1.md` — **your task list for this round.**
- Stack: Vite + React + TS + Tailwind (client); Node + Express (server); better-sqlite3; zod; vitest; OpenAI HTTP API behind the provider-agnostic `brain/` module. Both coach and utility models use gpt-4o (confirmed).
- This round was driven by real-use feedback: prompts felt generic, vocab primes were not topic-relevant, coaching explanations were too shallow, the profile did not update after submit, and the UI needs a redesign.
- `server/src/brain/rules.ts` already exists (authored by the reviewer): 18 named grammar/Chinglish principles with examples. **Use it; do not rewrite it.**

## Task
Implement `docs/superpowers/plans/2026-06-05-idiomate-v1.1.md` in this order:
1. **Workstream C first** — the coaching schema change (it defines the data shape everything else renders): extend `Annotation` with `rule?` and `ruleExample?`, extend `CoachResponse` with `nativeVersion?`, update the zod schemas, wire `rules.ts` into `assembleCoachPrompt`, and have the coach emit a named rule + why + example per issue plus a full natural `nativeVersion`. Persist the new fields.
2. **Then A, B, D in parallel:**
   - **A — Live news prompts:** new `server/src/news.ts` with `fetchHeadlines(topic, fetchImpl?)` hitting Google News RSS (`https://news.google.com/rss/search?q=<topic>&hl=en-US&gl=US&ceid=US:en`), topic rotation, `assembleNewsPrompt`, and `/api/prompt/today` that fetches headlines → generates via the utility model → caches per day, with an LLM-only fallback. Remove the static bank as the primary path.
   - **B — Vocab prime overhaul:** `getPrimeCandidatePool` (blended: top-by-priority + oldest-unused), wire `selectPrimeWords` into `/api/vocab/prime`, pass the **full prompt text** as topic, return **10** best-fit terms (favor phrases/collocations + academic/professional usefulness), increment `times_suggested` on the chosen.
   - **D — Profile refresh:** lift a `refreshKey` in `App.tsx`, bump it after a successful Save Session, pass to `ProfileDashboard` so it refetches `/api/profile`.
3. **Do NOT do Workstream E (UI redesign).** The reviewer will handle the redesign using the `design-taste-frontend` skill once C/B/D land. For C/B/D, make the UI render the new fields **functionally** (correctness over polish) — plain, working components are fine.

Follow each task's TDD steps; keep `fetchHeadlines` and providers injectable so tests never hit the network or OpenAI.

## Constraints (non-negotiable)
- **Reveal-gate intact:** `modelRewrite` and `nativeVersion` must NOT render in the UI until the user submits their own rewrite. The existing `CoachPanel` reveal-gate test must still pass; add equivalent coverage for `nativeVersion`.
- **Do not rewrite `rules.ts` or `taxonomy.ts`** — import and use them.
- **`brain/` stays provider/framework-agnostic** (no express/react imports); all LLM JSON validated with zod.
- **`/api/coach` returns annotations only and never writes `error_tally`**; tallies update only in `/api/sessions`.
- **Priming is never random** — use `getPrimeCandidatePool` + `selectPrimeWords`; keep `upsertVocab` dedup-by-normalized.
- **News fetch is best-effort:** a network/parse failure must fall back to LLM-only generation, never crash `/api/prompt/today`. Keep `fetchImpl` injectable.
- The API key stays server-side; `refs/` stays uncommitted; no secrets in code.
- No placeholders; DRY, YAGNI, TDD, frequent commits; small focused files.

## Output (report after each workstream)
```
WORKSTREAM <C|A|B|D>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n failed> (npx vitest run)
Files touched: <paths>
Deviations from plan: <none | what & why>
Blockers/questions: <none | list>
Next: <workstream>
```
Stop after each workstream and wait for the reviewer's go-ahead. If something is ambiguous beyond the spec/plan, ask one concrete question instead of guessing (UI styling excepted — plain is fine, the redesign comes later).
