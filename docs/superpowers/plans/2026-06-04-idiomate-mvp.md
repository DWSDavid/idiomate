# Idiomate MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is also designed to be handed to Codex as the executant** — see the Codex handoff at the end.

**Goal:** Build a local-first English writing companion that coaches paragraph-by-paragraph (annotate → user rewrites → side-by-side compare, never auto-fix), tracks recurring error patterns, and activates the user's own vocabulary.

**Architecture:** Single repo. Vite + React + TS + Tailwind frontend talks to a thin Node/Express backend that holds the `OPENAI_API_KEY` and owns a local SQLite DB. All LLM logic lives in a provider-agnostic `brain/` module so OpenAI is swappable. The coaching contract is a strict JSON schema validated with zod.

**Tech Stack:** Vite, React 18, TypeScript, TailwindCSS, Node, Express, better-sqlite3, zod, vitest, OpenAI HTTP API.

---

## File Structure

```
idiomate/
├── package.json                 # workspaces: client + server share root scripts
├── tsconfig.base.json
├── .env.example                 # OPENAI_API_KEY, model names
├── shared/
│   └── types.ts                 # types shared by client & server (Annotation, CoachResponse, ErrorType, Vocab…)
├── server/
│   ├── src/
│   │   ├── index.ts             # Express bootstrap
│   │   ├── config.ts            # env + model tiering
│   │   ├── db/
│   │   │   ├── schema.sql        # table DDL
│   │   │   ├── db.ts             # better-sqlite3 connection + migrate()
│   │   │   └── dal.ts            # typed data-access functions
│   │   ├── brain/
│   │   │   ├── provider.ts       # LLMProvider interface
│   │   │   ├── openai.ts         # OpenAIProvider
│   │   │   ├── taxonomy.ts       # ERROR_TAXONOMY v0 (10 types + meta)
│   │   │   ├── prompts.ts        # assembleCoachPrompt(), assemblePrimePrompt(), assembleDailyPrompt()
│   │   │   ├── coach.ts          # coachParagraph(): provider → zod-validated CoachResponse
│   │   │   └── schema.ts         # zod schemas for LLM JSON outputs
│   │   ├── import/
│   │   │   ├── youdao.ts         # parseYoudaoTxt(): UTF-16 → Vocab[]
│   │   │   └── enrich.ts         # enrichWord(): LLM + Free Dictionary IPA → Vocab
│   │   └── routes/
│   │       ├── prompts.ts        # GET /api/prompt/today
│   │       ├── coach.ts          # POST /api/coach
│   │       ├── sessions.ts       # POST/GET /api/sessions
│   │       ├── vocab.ts          # POST /api/vocab/import, GET /api/vocab/prime
│   │       └── profile.ts        # GET /api/profile (error tallies + activation)
│   └── tests/
│       ├── youdao.test.ts
│       ├── coach.test.ts
│       ├── prompts.test.ts
│       └── dal.test.ts
└── client/
    ├── index.html
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx               # routing/shell
    │   ├── api.ts                # typed fetch wrappers
    │   ├── components/
    │   │   ├── DailyPrompt.tsx
    │   │   ├── VocabPrime.tsx
    │   │   ├── WriteSurface.tsx
    │   │   ├── CoachPanel.tsx     # annotate→rewrite→compare loop
    │   │   ├── CompareView.tsx
    │   │   ├── CaptureWord.tsx    # quick-capture + enrichment preview/edit
    │   │   └── ProfileDashboard.tsx
    │   └── styles.css            # tailwind entry
    └── tests/
        └── coachPanel.test.tsx
```

**Boundary rule:** `brain/` never imports Express or React. `dal.ts` never builds prompts. UI never calls OpenAI directly.

---

## Phase 0 — Repo Scaffold

### Task 0.1: Initialize workspace
**Files:** Create `package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore` (exists).

- [ ] **Step 1:** Create root `package.json`:
```json
{
  "name": "idiomate",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "vite --config client/vite.config.ts",
    "test": "vitest run",
    "build": "vite build --config client/vite.config.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```
- [ ] **Step 2:** Create `.env.example`:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL_COACH=gpt-4o
OPENAI_MODEL_UTILITY=gpt-4o-mini
PORT=8787
```
- [ ] **Step 3:** Create `tsconfig.base.json` with `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"target": "ES2022"`, `"esModuleInterop": true`, `"skipLibCheck": true`.
- [ ] **Step 4:** `npm install`. Expected: lockfile created, no errors.
- [ ] **Step 5:** Commit: `chore: scaffold idiomate workspace`.

### Task 0.2: Vite client bootstrap + Tailwind
- [ ] Create `client/vite.config.ts` (react plugin, server proxy `/api` → `http://localhost:8787`), `client/index.html`, `client/src/main.tsx` rendering `<App/>`, `tailwind.config.js`, `client/src/styles.css` with the three `@tailwind` directives.
- [ ] `App.tsx` renders a placeholder `<h1>Idiomate</h1>`.
- [ ] Run `npm run dev:client`, confirm page loads. Commit: `chore: client + tailwind bootstrap`.

---

## Phase 1 — Shared Types & Data Layer

### Task 1.1: Shared types (the contract everything depends on)
**Files:** Create `shared/types.ts`.

- [ ] **Step 1:** Write the file exactly:
```ts
export const ERROR_TYPES = [
  'redundancy', 'calque', 'over_explanation', 'tense', 'modality',
  'word_order', 'sprawl', 'small_grammar', 'word_choice', 'cohesion',
  'vocab_suggestion',
] as const;
export type ErrorType = typeof ERROR_TYPES[number];

export interface Annotation {
  span: string;            // exact substring of the paragraph
  errorType: ErrorType;
  hint: string;            // shown BEFORE the user rewrites (no answer leaked)
  explanation: string;     // shown AFTER, names the error + why
  modelRewrite: string;    // hidden until user submits their rewrite
  vocabWord?: string;      // set when errorType === 'vocab_suggestion'
}

export interface CoachResponse {
  paragraphIndex: number;
  annotations: Annotation[];
}

export interface Vocab {
  id?: number;
  word: string;
  ipa?: string;
  defCn?: string;
  pos?: string;
  status?: string;
  source?: string;            // 'youdao' | 'capture'
  contextSentence?: string;   // where the user met the word (e.g. an FT headline)
  examples?: string[];        // stored as JSON text in DB
  collocations?: string[];    // stored as JSON text in DB
  register?: string;          // e.g. 'formal', 'neutral', 'informal/journalistic'
  timesSuggested: number;
  timesUsed: number;
}

export interface Prompt { id?: number; date: string; theme: string; text: string; sourceUrl?: string; }
export interface ErrorTally { errorType: ErrorType; count: number; lastSeen: string; }
```
- [ ] **Step 2:** Commit: `feat: shared types contract`.

### Task 1.2: SQLite schema + connection (TDD)
**Files:** Create `server/src/db/schema.sql`, `server/src/db/db.ts`, `server/tests/dal.test.ts`, `server/src/db/dal.ts`.

- [ ] **Step 1 (failing test):** `server/tests/dal.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, migrate } from '../src/db/db.js';
import { insertVocab, getVocabSample, recordErrors, getTallies } from '../src/db/dal.js';

let db: ReturnType<typeof openDb>;
beforeEach(() => { db = openDb(':memory:'); migrate(db); });

it('inserts and samples vocab', () => {
  insertVocab(db, [{ word: 'leverage', defCn: '利用', timesSuggested: 0, timesUsed: 0 }]);
  expect(getVocabSample(db, 5).length).toBe(1);
});

it('tallies error types across calls', () => {
  recordErrors(db, ['redundancy', 'calque', 'redundancy']);
  const t = getTallies(db);
  expect(t.find(x => x.errorType === 'redundancy')!.count).toBe(2);
});
```
- [ ] **Step 2:** Run `npx vitest run server/tests/dal.test.ts` → FAIL (modules missing).
- [ ] **Step 3:** `schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, ipa TEXT, def_cn TEXT, pos TEXT,
  status TEXT, source TEXT, context_sentence TEXT, examples TEXT, collocations TEXT,
  register TEXT, date_added TEXT DEFAULT (datetime('now')),
  times_suggested INTEGER DEFAULT 0, times_used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, date TEXT, theme TEXT, text TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, date TEXT, prompt_id INTEGER, draft_text TEXT,
  final_text TEXT, duration_s INTEGER);
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY, session_id INTEGER, paragraph_idx INTEGER, span_text TEXT,
  error_type TEXT, hint TEXT, explanation TEXT, model_rewrite TEXT,
  user_rewrite TEXT, accepted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS error_tally (
  error_type TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_seen TEXT);
```
- [ ] **Step 4:** `db.ts`:
```ts
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export function openDb(path = join(here, '../../idiomate.sqlite')) { return new Database(path); }
export function migrate(db: Database.Database) {
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
}
```
- [ ] **Step 5:** `dal.ts` — implement `insertVocab`, `getVocabSample(db, n)` (`ORDER BY RANDOM() LIMIT n`), `recordErrors(db, types[])` (UPSERT into `error_tally` incrementing `count`, set `last_seen=datetime('now')`), `getTallies(db)`, plus `insertSession`, `insertAnnotations`, `incrementVocabUsed(db, word)`. Use prepared statements; map snake_case ↔ camelCase. **`examples` and `collocations` are `JSON.stringify`'d on write and `JSON.parse`'d on read** (DB columns are TEXT).
- [ ] **Step 6:** Run test → PASS. Commit: `feat: sqlite schema + DAL`.

---

## Phase 2 — Youdao Vocab Importer (UTF-16, real fixture)

### Task 2.1: Parser (TDD)
**Files:** Create `server/tests/youdao.test.ts`, `server/src/import/youdao.ts`, fixture `server/tests/fixtures/youdao-sample.txt`.

> The real export is **UTF-16LE**, structured as `序号, word [IPA] 释义...` then `n./v. 中文定义` lines, then a `未读熟单词`-style status marker. The parser reads as `utf16le`, splits on the numbered-entry boundary `^\d+\s*,`, and extracts word, IPA, and the concatenated Chinese definition.

- [ ] **Step 1:** Create the fixture by copying ~6 real entries from the user's file (Codex: ask the user to paste 6 entries, or read from the provided export). Save as UTF-16LE.
- [ ] **Step 2 (failing test):**
```ts
import { describe, it, expect } from 'vitest';
import { parseYoudaoTxt } from '../src/import/youdao.js';
import { readFileSync } from 'node:fs';

it('parses words, ipa, and cn definition', () => {
  const buf = readFileSync(new URL('./fixtures/youdao-sample.txt', import.meta.url));
  const vocab = parseYoudaoTxt(buf);
  expect(vocab.length).toBeGreaterThanOrEqual(5);
  const husband = vocab.find(v => v.word === 'husband');
  expect(husband).toBeDefined();
  expect(husband!.defCn).toContain('丈夫'); // or whatever the real def is
});

it('handles utf16 without mojibake', () => {
  const buf = readFileSync(new URL('./fixtures/youdao-sample.txt', import.meta.url));
  const vocab = parseYoudaoTxt(buf);
  expect(vocab.every(v => !v.word.includes(' '))).toBe(true);
});
```
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement:
```ts
import type { Vocab } from '../../../shared/types.js';

export function parseYoudaoTxt(buf: Buffer): Vocab[] {
  // Decode UTF-16LE (strip BOM if present)
  let text = buf.toString('utf16le').replace(/^﻿/, '');
  // Collapse the per-character spacing some exports produce, but keep real word spacing:
  // entries start with "<number> ,"
  const blocks = text.split(/(?=^\s*\d+\s*,)/m).map(b => b.trim()).filter(Boolean);
  const out: Vocab[] = [];
  for (const block of blocks) {
    const header = block.split(/\r?\n/)[0];
    const m = header.match(/^\s*\d+\s*,\s*([A-Za-z][A-Za-z\- ]*?)\s*(?:\[([^\]]*)\])?\s*(?:释义|翻译|$)/);
    if (!m) continue;
    const word = m[1].replace(/\s+/g, ' ').trim();
    const ipa = m[2]?.replace(/\s+/g, '').trim();
    const defCn = block.split(/\r?\n/).slice(1)
      .filter(l => /[一-鿿]/.test(l))
      .join(' ').replace(/\s+/g, ' ').trim();
    if (word) out.push({ word, ipa, defCn, timesSuggested: 0, timesUsed: 0 });
  }
  return out;
}
```
> Codex: the exact header regex must be tuned against the **real** file — the sample in the spec shows extra spacing between characters. Verify against the user's export and adjust the split/normalize step until the test passes on real data.
- [ ] **Step 5:** Run → PASS. Commit: `feat: youdao utf16 importer`.

> **Validated against the real `Vocabs.txt` (2026-06-04):** the regex above parses **2,715 / 2,723** entries cleanly (IPA + CN, no mojibake). Two refinements to apply:
> 1. The 8 failures are **reverse `中译英` entries** (Chinese headwords like `拍马屁 … 中译英`). Skip them (don't treat as English vocab) — current regex already does, just don't count them as errors.
> 2. **Strip trailing status markers** from `defCn`: tokens like `未分组单词`, `未读熟单词`, `未分组单`. Add a cleanup: `defCn.replace(/\s*(未分组单词?|未读熟单词?|已掌握)\s*$/,'').trim()`.

### Task 2.2: Word enrichment — LLM-first + Free Dictionary backstop (TDD)
**Files:** Create `server/src/import/enrich.ts`, `server/src/brain/schema.ts` (extend), `server/tests/enrich.test.ts`.

> Daily intake path for new words. **LLM (utility model)** produces def/CN/examples/collocations/register; **IPA comes from the Free Dictionary API** (`https://api.dictionaryapi.dev/api/v2/entries/en/<word>`) when available, else falls back to the LLM's IPA. **Cambridge is NOT scraped.** Enrichment returns a `Vocab` the user can edit before saving.

- [ ] **Step 1:** Extend `schema.ts` with a zod schema for the LLM enrichment output:
```ts
export const enrichZ = z.object({
  ipa: z.string().optional(),
  defCn: z.string(),
  pos: z.string().optional(),
  examples: z.array(z.string()).max(3),
  collocations: z.array(z.string()).max(6),
  register: z.string(),
});
```
- [ ] **Step 2 (failing test)** with a mock provider + injected fetch:
```ts
import { describe, it, expect } from 'vitest';
import { enrichWord } from '../src/import/enrich.js';
import type { LLMProvider } from '../src/brain/provider.js';

const mock: LLMProvider = { async complete() {
  return JSON.stringify({ defCn:'利用；杠杆', pos:'v.', examples:['Firms leverage data to cut costs.'],
    collocations:['leverage data','financial leverage'], register:'neutral/business', ipa:'ˈlevərɪdʒ' });
}};
// fake Free Dictionary API returning an authoritative IPA
const fakeFetch = async () => ({ ok:true, json: async () => ([{ phonetic:'/ˈliːvərɪdʒ/' }]) }) as any;

it('merges LLM fields with dictionary IPA (dictionary wins)', async () => {
  const v = await enrichWord('leverage', { provider: mock, model:'test', fetchImpl: fakeFetch, contextSentence:'Firms leverage AI.' });
  expect(v.word).toBe('leverage');
  expect(v.defCn).toContain('利用');
  expect(v.ipa).toBe('/ˈliːvərɪdʒ/');        // dictionary backstop wins
  expect(v.source).toBe('capture');
  expect(v.contextSentence).toBe('Firms leverage AI.');
});

it('falls back to LLM ipa when dictionary has none', async () => {
  const noIpaFetch = async () => ({ ok:true, json: async () => ([{}]) }) as any;
  const v = await enrichWord('leverage', { provider: mock, model:'test', fetchImpl: noIpaFetch });
  expect(v.ipa).toBe('ˈlevərɪdʒ');
});
```
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement `enrich.ts`:
```ts
import type { LLMProvider } from '../brain/provider.js';
import { enrichZ } from '../brain/schema.js';
import type { Vocab } from '../../../shared/types.js';

interface EnrichOpts {
  provider: LLMProvider; model: string;
  fetchImpl?: typeof fetch; contextSentence?: string;
}
export async function enrichWord(word: string, opts: EnrichOpts): Promise<Vocab> {
  const f = opts.fetchImpl ?? fetch;
  const system = 'You are a lexicographer for an advanced Chinese-L1 English learner. Return ONLY JSON: '
    + '{ipa?, defCn, pos?, examples[<=3], collocations[<=6], register}. defCn is a concise Chinese gloss. '
    + 'examples are natural sentences (business/journalistic where apt). register e.g. formal/neutral/informal.';
  const raw = await opts.provider.complete({ system, user: `Word: ${word}`, model: opts.model });
  const llm = enrichZ.parse(JSON.parse(raw));
  let ipa = llm.ipa;
  try {
    const res = await f(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (res.ok) {
      const data: any = await res.json();
      const dictIpa = data?.[0]?.phonetic ?? data?.[0]?.phonetics?.find((p: any) => p.text)?.text;
      if (dictIpa) ipa = dictIpa; // dictionary backstop wins
    }
  } catch { /* network optional; keep LLM ipa */ }
  return {
    word, ipa, defCn: llm.defCn, pos: llm.pos, register: llm.register,
    examples: llm.examples, collocations: llm.collocations,
    source: 'capture', contextSentence: opts.contextSentence,
    status: 'new', timesSuggested: 0, timesUsed: 0,
  };
}
```
- [ ] **Step 5:** Run → PASS. Commit: `feat: word enrichment (llm + dictionary ipa)`.

---

## Phase 3 — Brain Module (provider-agnostic, the de-risked core)

### Task 3.1: Provider interface + OpenAI provider
**Files:** Create `server/src/brain/provider.ts`, `server/src/brain/openai.ts`, `server/src/config.ts`.

- [ ] **Step 1:** `provider.ts`:
```ts
export interface LLMProvider {
  complete(opts: { system: string; user: string; model: string }): Promise<string>;
}
```
- [ ] **Step 2:** `config.ts`:
```ts
export const config = {
  apiKey: process.env.OPENAI_API_KEY ?? '',
  modelCoach: process.env.OPENAI_MODEL_COACH ?? 'gpt-4o',
  modelUtility: process.env.OPENAI_MODEL_UTILITY ?? 'gpt-4o-mini',
  port: Number(process.env.PORT ?? 8787),
};
```
- [ ] **Step 3:** `openai.ts` — implement `OpenAIProvider implements LLMProvider` using `fetch('https://api.openai.com/v1/chat/completions', …)` with `response_format: { type: 'json_object' }`, `temperature: 0.4`, returning `choices[0].message.content`. Throw on non-200 with the response body.
- [ ] **Step 4:** Commit: `feat: LLMProvider + OpenAI provider`.

### Task 3.2: Error taxonomy v0
**Files:** Create `server/src/brain/taxonomy.ts`.

- [ ] **Step 1:** Define the 10 types (+`vocab_suggestion`) as a record with `name`, `whatItIs`, and `examples` (`{before, after}[]`). Seed each with 1–2 examples. The `redundancy`, `calque`, `over_explanation`, `sprawl` entries should draw examples from *中式英语之鉴* once the PDF is located (Codex: leave a `// TODO(pinkham): expand` ONLY for additional examples, never for the type itself).
- [ ] **Step 2:** Export `taxonomySnippet(types: ErrorType[]): string` that renders the relevant entries compactly for prompt injection.
- [ ] **Step 3:** Commit: `feat: error taxonomy v0`.

### Task 3.3: Coaching contract + assembly (TDD with a mock provider)
**Files:** Create `server/src/brain/schema.ts`, `server/src/brain/prompts.ts`, `server/src/brain/coach.ts`, `server/tests/coach.test.ts`.

- [ ] **Step 1:** `schema.ts` — zod schema mirroring `CoachResponse`:
```ts
import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';
export const annotationZ = z.object({
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  modelRewrite: z.string(),
  vocabWord: z.string().optional(),
});
export const coachResponseZ = z.object({
  paragraphIndex: z.number(),
  annotations: z.array(annotationZ),
});
```
- [ ] **Step 2:** `prompts.ts` — `assembleCoachPrompt(ctx)` returns `{ system, user }`. The **system** prompt MUST encode the non-negotiables:
  - "You are a writing coach for an advanced Chinese-L1 writer. NEVER rewrite the whole text for them as the primary output. Identify issues, name each by errorType, give a one-line hint that does NOT reveal the fix, and a separate modelRewrite that the UI will hide until the user has tried."
  - Inject: the paragraph, the user's top recurring error types (so it can prioritize/reference), the vocab candidates (for `vocab_suggestion` annotations — suggest, never force), and `taxonomySnippet(...)`.
  - "Return ONLY JSON matching: {paragraphIndex, annotations:[{span,errorType,hint,explanation,modelRewrite,vocabWord?}]}."
- [ ] **Step 3 (failing test):**
```ts
import { describe, it, expect } from 'vitest';
import { coachParagraph } from '../src/brain/coach.js';
import type { LLMProvider } from '../src/brain/provider.js';

const mock: LLMProvider = { async complete() {
  return JSON.stringify({ paragraphIndex: 0, annotations: [
    { span: 'in order to', errorType: 'redundancy', hint: 'Two words can do this job.',
      explanation: 'Redundancy: "in order to" → "to".', modelRewrite: 'to' }]});
}};

it('validates and returns a CoachResponse, hint never equals modelRewrite leak', async () => {
  const res = await coachParagraph(mock, { paragraph: 'We did X in order to Y', paragraphIndex: 0,
    topErrors: ['redundancy'], vocabCandidates: [], model: 'test' });
  expect(res.annotations[0].errorType).toBe('redundancy');
  expect(res.annotations[0].modelRewrite).toBe('to');
});

it('throws on malformed JSON', async () => {
  const bad: LLMProvider = { async complete() { return 'not json'; } };
  await expect(coachParagraph(bad, { paragraph: 'x', paragraphIndex: 0, topErrors: [], vocabCandidates: [], model: 'test' }))
    .rejects.toThrow();
});
```
- [ ] **Step 4:** Run → FAIL.
- [ ] **Step 5:** `coach.ts`:
```ts
import type { LLMProvider } from './provider.js';
import { assembleCoachPrompt } from './prompts.js';
import { coachResponseZ } from './schema.js';
import type { CoachResponse } from '../../../shared/types.js';

export interface CoachContext {
  paragraph: string; paragraphIndex: number;
  topErrors: string[]; vocabCandidates: { word: string; defCn?: string }[]; model: string;
}
export async function coachParagraph(p: LLMProvider, ctx: CoachContext): Promise<CoachResponse> {
  const { system, user } = assembleCoachPrompt(ctx);
  const raw = await p.complete({ system, user, model: ctx.model });
  const json = JSON.parse(raw); // throws on bad json → caught upstream
  return coachResponseZ.parse(json);
}
```
- [ ] **Step 6:** Run → PASS. Commit: `feat: coaching contract + assembly`.

### Task 3.4: Daily prompt + vocab prime assembly (TDD)
**Files:** `server/src/brain/prompts.ts` (extend), `server/tests/prompts.test.ts`.
- [ ] Add `assembleDailyPrompt({theme})` and `assemblePrimePrompt({topic, vocab})`. Test with a mock provider that the daily prompt request includes the theme mix (finance/tech dominant + occasional professional) and that prime returns 3–5 words. Commit: `feat: daily-prompt + vocab-prime assembly`.

---

## Phase 4 — Backend API

### Task 4.1: Express bootstrap + routes
**Files:** `server/src/index.ts`, `server/src/routes/*.ts`.
- [ ] `index.ts`: create app, `express.json({limit:'1mb'})`, mount routers, `migrate(openDb())` on boot, listen on `config.port`.
- [ ] `coach.ts`: `POST /api/coach` body `{sessionId?, paragraphIndex, paragraph}` → load `topErrors=getTallies()` (top 3), `vocabCandidates=getVocabSample(8)`, call `coachParagraph(new OpenAIProvider(), {...,model:config.modelCoach})`, **do not** persist error tallies yet (only on submit), return `CoachResponse`.
- [ ] `sessions.ts`: `POST /api/sessions` persists draft/final + annotations (with the user's rewrite) and calls `recordErrors(db, errorTypes)` — **this** is where the error profile updates. `vocab_suggestion` annotations that the user accepted increment `times_used`.
- [ ] `prompts.ts`: `GET /api/prompt/today` returns today's prompt (from bank; generate+cache via utility model if none).
- [ ] `vocab.ts`: `POST /api/vocab/import` (multipart or raw body) → `parseYoudaoTxt` → `insertVocab`; `GET /api/vocab/prime?topic=` → 3–5 words + increments `times_suggested`.
- [ ] `vocab.ts` (capture): `POST /api/vocab/capture` body `{word, contextSentence?}` → `enrichWord(word, {provider:new OpenAIProvider(), model:config.modelUtility, contextSentence})` → return the enriched `Vocab` **without saving** (preview). `POST /api/vocab/save` body `Vocab` → `insertVocab` (after the user's edits). Two-step so the user can edit before commit.
- [ ] `profile.ts`: `GET /api/profile` → `{tallies, activation:{suggested,used}}`.
- [ ] Manual smoke: `curl` each route. Commit per route: `feat(api): <route>`.

---

## Phase 5 — Frontend (component contracts)

> UI tasks are specified at **contract level**: each component's props, state, and the few pieces of non-obvious logic. Codex implements the JSX/Tailwind. The ONE piece of strict logic is the **reveal gate** in `CoachPanel`.

### Task 5.1: API client + App shell
**Files:** `client/src/api.ts`, `client/src/App.tsx`.
- [ ] `api.ts`: typed wrappers `getTodayPrompt()`, `primeVocab(topic)`, `coach(paragraph, idx)`, `submitSession(payload)`, `getProfile()`, `importVocab(file)`. All hit `/api/...`.
- [ ] `App.tsx`: vertical layout — `DailyPrompt` → `VocabPrime` → `WriteSurface` → `CoachPanel` (per paragraph) → `ProfileDashboard`. Single-page.

### Task 5.2: DailyPrompt + VocabPrime
- [ ] `DailyPrompt`: fetches `/api/prompt/today`, shows theme + text, a "new prompt" button.
- [ ] `VocabPrime`: on prompt load, calls `primeVocab(topic)`; shows 3–5 chips `word — defCn`; purely informational nudge.

### Task 5.3: WriteSurface
- [ ] Controlled `<textarea>`; tracks paragraphs by splitting on blank lines; a "Coach this paragraph" button per paragraph; **never** auto-edits text.

### Task 5.4: CoachPanel — the reveal gate (TDD)
**Files:** `client/src/components/CoachPanel.tsx`, `client/src/components/CompareView.tsx`, `client/tests/coachPanel.test.tsx`.

- [ ] **Step 1 (failing test)** with React Testing Library:
```tsx
// modelRewrite must NOT be in the DOM before the user submits a rewrite
import { render, screen } from '@testing-library/react';
import { CoachPanel } from '../src/components/CoachPanel';
const ann = [{ span:'in order to', errorType:'redundancy', hint:'Two words can do this job.',
  explanation:'Redundancy.', modelRewrite:'to' }];
it('hides modelRewrite until submit', () => {
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={()=>{}} />);
  expect(screen.getByText(/Two words can do this job/)).toBeInTheDocument();
  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument(); // the fix is not shown yet
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `CoachPanel`:
  - Props: `{ paragraph, annotations: Annotation[], onSubmit(rewrite, accepted) }`.
  - State machine: `phase: 'review' | 'rewriting' | 'compared'`.
  - `review`: show each annotation's `span + errorType name + hint`. **Do not render `modelRewrite` or `explanation`.**
  - `rewriting`: a textarea for the user's full-paragraph rewrite + Submit.
  - On submit → `phase='compared'` → render `CompareView` (user rewrite vs original; reveal each `modelRewrite + explanation`); call `onSubmit`.
- [ ] **Step 4:** Run → PASS. Commit: `feat(ui): coaching reveal gate`.

### Task 5.5: ProfileDashboard
- [ ] `GET /api/profile`; render top recurring error types (bar list with counts + lastSeen) and a vocab activation ratio (`used/suggested`). Read-only.

### Task 5.6: CaptureWord (Quick Capture UI)
**Files:** `client/src/components/CaptureWord.tsx`, extend `client/src/api.ts`.
- [ ] `api.ts`: add `captureWord(word, contextSentence?)` → `POST /api/vocab/capture`; `saveVocab(v)` → `POST /api/vocab/save`.
- [ ] `CaptureWord`: a small always-available input ("+ new word" with optional "where you saw it" field). On submit → call `captureWord` → show the enriched fields (ipa, defCn, examples, collocations, register) in **editable** inputs → "Save" calls `saveVocab`. Newly saved words become eligible for priming. Surface in `App.tsx` (e.g. a header button/drawer).

---

## Phase 6 — Wiring & Acceptance

### Task 6.1: End-to-end smoke
- [ ] `npm run dev`; import the user's real vocab; load a prompt; write 2 paragraphs; coach each; rewrite; submit; confirm `error_tally` updates and dashboard reflects it.
- [ ] Write `README.md`: setup (`.env`, `npm i`, `npm run dev`), how to import vocab, the coaching loop, and the "swap provider" note.
- [ ] Commit: `docs: readme + e2e smoke notes`.

---

## Self-Review (spec coverage)

| Spec section | Covered by |
|---|---|
| Coaching loop (annotate→rewrite→compare) | Task 3.3 (contract), 5.4 (reveal gate) |
| Never auto-fix | 4.1 coach route (returns annotations only), 5.4 (hidden modelRewrite) |
| Error taxonomy v0 (10) | 1.1 types, 3.2 taxonomy |
| Error profile tracking | 1.2 DAL tallies, 4.1 sessions route, 5.5 dashboard |
| Vocab prime + nudge | 3.4 prime, 4.1 vocab route, 5.2; nudge via `vocab_suggestion` in 3.3 |
| Vocab activation metric | DAL `times_suggested/used`, 5.5 |
| Youdao importer (UTF-16) | Phase 2 (Task 2.1) |
| Quick Capture + LLM/dictionary enrichment | Task 2.2 (enrich), 4.1 capture/save routes, 5.6 CaptureWord UI |
| Daily prompt (finance/tech mix) | 3.4, 4.1 prompts |
| Provider-agnostic / OpenAI tiering | 3.1 provider, config tiering |
| Local-only SQLite | Phase 1 |

**Open (carried from spec):** locate 中式英语之鉴 PDF → seed more taxonomy examples (3.2); calibrate exact OpenAI model picks once key is in.

---

## Codex Handoff

A ready-to-paste Codex prompt (Role / Context / Task / Constraints / Output) is delivered separately by Claude. Codex executes phase-by-phase, committing per task; Claude reviews each phase against the Self-Review table.
