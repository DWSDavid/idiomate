# Codex Handoff Prompt - Idiomate v1.2

> Paste below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
You are the executant engineer for Idiomate v1.2. Implement the approved plan exactly, TDD, commit per workstream. A reviewer (Claude) checks each. Read the named docs first; assume nothing beyond them.

## Context
- Project root: `D:\dev\idiomate` (git; v1.0 + v1.1 shipped and running).
- Read first, in order:
  1. `docs/superpowers/specs/2026-06-04-idiomate-design.md`
  2. `docs/superpowers/plans/2026-06-05-idiomate-v1.2.md`  ← your task list this round
- Stack: Vite + React + TS + Tailwind (client); Node + Express (server); better-sqlite3; zod; vitest; OpenAI (gpt-4o, both tiers). Provider-agnostic `brain/`.
- Backend ALREADY persists every mistake (`annotations` table has span/error_type/rule/rule_example/user_rewrite, `error_tally` counts per type). `rules.ts` (named principles) and `taxonomy.ts` (11 error types) exist - reuse, do not rewrite. `news.ts` fetches Google News RSS titles.
- This round came from real use: the profile felt dead (errors only recorded on a separate "Save session" click), example sentences looked canned (the model copied generic taxonomy examples), and the user wants persistent error ranking, systematic grammar lessons, sourced content research, and structure guidance.

## Task - implement the v1.2 plan in this order

**P0 first (fix the broken core loop):**
1. **W1 Live error tracking.** Add `POST /api/paragraph-result` that persists annotations + `recordErrors` + `incrementVocabUsed` the moment a paragraph rewrite is submitted (reuse/create today's session row; re-submitting a paragraph replaces its prior annotations so counts do not double). Wire `CoachPanel` submit to call it; the App refetches the profile right after. "Save session" becomes optional.
2. **W2 Contextual ruleExample.** In `assembleCoachPrompt`, instruct that `ruleExample.before` MUST come from the user's own text for that issue (its corrected form in `after`), and NEVER copy the example sentences from the injected Taxonomy/Rules sections. Optionally strip example sentences from the injected snippets to remove the temptation.

**Then P1:**
3. **W3** error ranking + drill-down (`getMistakeRanking`, `getMistakeLog`, `/api/profile` + `/api/mistakes`).
4. **W4** systematic lessons (`/api/lesson?type=`, Chinglish `mindset` notes - leave a clearly marked seam; the reviewer authors the original mindset text).
5. **W5** content analysis + sourced research (`fetchNews` with links, `/api/research` -> analysis + angles + `{title, link, summary}[]`).
6. **W6** structure guidance (`/api/structure` -> ideal outline + per-part status).

Do P2 (W7-W9) only after P1 review.

## Constraints (non-negotiable)
- **`server/` and `shared/` ONLY. Do NOT edit `client/` beyond the minimum functional rendering needed to exercise new endpoints** (plain components, correctness over polish). The reviewer owns all `client/` styling and will redesign new panels with the taste skill. (Last round we collided in `client/`; do not repeat.)
- Reveal-gate intact: never expose a fix / native version / model rewrite before the user submits their own rewrite.
- Reuse `rules.ts` and `taxonomy.ts`; do not rewrite them. Keep the tolerant `errorType` enum.
- `brain/` stays provider/framework-agnostic; validate ALL LLM JSON with zod.
- Every external call (news/research) is best-effort with a graceful fallback and an injectable `fetchImpl`; tests never hit the network or OpenAI.
- Idempotency for W1: re-submitting the same paragraph must not double-count.
- No placeholders, DRY/YAGNI/TDD, frequent commits, small focused files. No em-dashes in user-facing strings.

## Output - report after each workstream
```
WORKSTREAM <id>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n failed> (npx vitest run)
Files touched: <paths>
Deviations from plan: <none | what & why>
Blockers/questions: <none | list>
Next: <id>
```
Stop after each workstream and wait for the reviewer. Ask one concrete question if something is ambiguous beyond the spec/plan (UI styling excepted - plain is fine; the reviewer restyles).
