# Codex Handoff Prompt - Idiomate v1.3 (private shareable deploy)

> Paste below the line into Codex, running inside `D:\dev\idiomate`.

---

## Role
Executant engineer for Idiomate v1.3. Turn the local single-user tool into a privately shareable, multi-user, deployed web app. Implement the approved plan exactly, TDD, commit per workstream. A reviewer (Claude) checks each.

## Context
- Project root: `D:\dev\idiomate` (git; v1.0-v1.2 shipped). Stack: Vite + React + TS + Tailwind client; Node + Express server; better-sqlite3; zod; vitest; OpenAI (gpt-4o, key server-side).
- Read first: `docs/superpowers/plans/2026-06-06-idiomate-v1.3-shareable.md` (your task list).
- Today it runs locally on two ports (vite 5173 + api 8787) with ONE global SQLite db and no auth. The goal: one https origin, per-user data isolation, a shared access code, and a deploy config for a Node host with a persistent volume.

## Task - implement in order: S1 -> S2 -> S3 -> S4

**S1 Single-origin serving + prod build/start.** Make `config.dbPath` come from `DB_PATH` env; Express serves the built client (`express.static` + SPA fallback that does not shadow `/api`); add `start` script + a `Dockerfile` (node 20-slim, build tools for better-sqlite3, `npm ci`, `npm run build`, `CMD npm start`). App must load from a single port with `/api` on same origin.

**S2 Per-user data isolation (heavy - do carefully).** Lightweight identity: client generates a UUID (localStorage `idiomate_uid`) + a display name; sends `x-user-id`/`x-user-name` on every `/api` request; server middleware upserts the user and sets `req.userId`. Add a `users` table; add `user_id` to `sessions`, `vocab`, `error_tally`, sentence-lab tables; `vocab` unique -> `(user_id, normalized)`; `error_tally` PK -> `(user_id, error_type)`; annotations scope via `sessions.user_id`. **Thread `userId` through EVERY DAL read/write and every route** - no global queries may remain. Migrate existing local rows to a default user `'local'`. Add tests proving two users do not see each other's data.

**S3 Private access gate.** env `ACCESS_CODE`; middleware on `/api/*` requires header `x-access-code` to match when the env is set (else 401), and allows all when unset (local dev). Client: a small gate screen that captures the code, stores it, and sends it on every request. Test 401 without/with wrong code.

**S4 Deploy config + docs.** A deploy manifest for a Node host with a **persistent volume** for SQLite (Render with a disk, or Fly.io volume - NOT Vercel, its FS will not persist SQLite). Mount the volume, point `DB_PATH` at it. Document env vars (`OPENAI_API_KEY`, `OPENAI_MODEL_COACH`, `OPENAI_MODEL_UTILITY`, `ACCESS_CODE`, `DB_PATH`, `PORT`) and a step-by-step deploy + "share URL + access code; each peer enters a name" in README.

**S0 (do NOT build unless the user says so):** stripping the reproduced book quotes. The user opted to defer it. Leave `chinglishBook.ts` as is for now.

## Constraints (non-negotiable)
- After S2, **no DAL function may run an unscoped query** - every read/write filters/sets `user_id`. This is the acceptance bar for S2.
- Reveal-gate and all prior behavior unchanged. `brain/` stays provider/framework-agnostic; validate LLM JSON with zod. Do not weaken existing tests; add per-user tests.
- Secrets only via env. Never commit keys, the access code, `refs/`, or any `.sqlite` file (gitignore the local DB path).
- `server/` + `shared/` + deploy config + the MINIMUM `client/` changes for identity, the access gate, and request headers. Do NOT restyle existing client UI - the reviewer owns visual polish.
- No placeholders; DRY/YAGNI/TDD; small focused files; frequent commits; no em-dashes in user-facing strings.

## Output - report after each workstream
```
WORKSTREAM <S1|S2|S3|S4>: DONE
Commits: <hashes + subjects>
Tests: <n passed / n failed> (npx vitest run)
Files touched: <paths>
Deviations from plan: <none | what & why>
Blockers/questions: <none | list>
Next: <id>
```
Stop after each workstream and wait for the reviewer. S2 is large - if anything is ambiguous about scoping a specific query, ask rather than guess.
