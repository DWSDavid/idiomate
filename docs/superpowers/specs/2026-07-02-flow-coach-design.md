# Flow Coach — Design Spec

Date: 2026-07-02
Status: Approved (ready for implementation)

## Problem

The user (advanced Chinese-L1 writer) can find and save strong vocabulary but
struggles to (1) link sentences with the right connective, (2) choose the right
tense for the context, and (3) break one long, illogical sentence into smaller
logical pieces. Existing tools do not cover this:

- **Coach** (paragraph): hunts for errors inside a span.
- **Sentence Lab** (single sentence): checks one sentence's correctness, hint-then-reveal.

Neither teaches the connective reasoning *between* sentences (which needs the
neighboring sentence as context), nor gives targeted practice. The user also
reports "I have great vocab but can't use it in writing/speaking."

## Solution

A new **Flow Coach** tab. The user pastes a multi-sentence draft; it walks each
sentence *in relation to the previous one* and, for each, teaches the move
(split → rewrite → why-connective → why-tense) and then drills it with a
write-your-own exercise seeded from the user's own saved vocabulary.

## Approved decisions

1. **Core shape:** whole-draft, line-by-line (sees neighboring sentences). Not a
   single-sentence tool and not folded into the paragraph Coach.
2. **Drill:** write-your-own + AI check (active production, AI-graded).
3. **Vocab activation:** analysis stays focused on flow/tense/splitting; each
   write-your-own drill is *seeded with the user's saved words/collocations* so
   practice recycles owned vocab.
4. **Pedagogy:** analysis *shows* the rewrite + why immediately (learn the
   pattern); the drill is where the user actively produces (a deliberate flip
   from Sentence Lab's hide-until-rewrite).
5. **v1 is stateless** — no DB persistence. Live coaching surface. History later.

## Architecture

### Data flow

1. User pastes draft (+ optional context) → `POST /api/flow/analyze`.
   - **One** LLM call for the whole draft, so the model reasons about transitions
     across sentences and cost/latency stay bounded.
   - Server pulls the user's saved vocab (existing DAL) and passes a sample to the
     prompt so drills can be seeded from it.
2. Response: ordered array of `FlowLine`, one per sentence.
3. Drill attempt → `POST /api/flow/drill/check` with the drill + the user's
   attempt → AI grades (correct?, which linker/tense used, feedback) and reveals
   the model answer.

### `FlowLine` contents

- `original`: the sentence as written.
- `pieces: string[]`: the logical sub-ideas it contains (decomposition).
- `rewrite`: improved version (split into logical pieces, correct tense/connective,
  which/that added when needed).
- `linkToPrevious: { connective: string; why: string } | null`: the connective
  decision relative to the previous sentence (merge / new sentence / moreover /
  as a result / however / relative clause …) with the reason. `null` for the first
  sentence.
- `tenseNote: { tense: string; why: string } | null`: only when tense is a teaching
  point.
- `changes: string[]`: short list of what changed and why (calque, split, etc.).
- `drill: FlowDrill`.

### `FlowDrill`

- `prompt`: a NEW mini sentence-pair in a *similar* context to practice the same
  skill.
- `targetSkill`: e.g. "concession connective + present tense".
- `vocabUsed: string[]`: the saved words the drill asks the user to deploy.
- `modelAnswer`: hidden until the check returns.

### `FlowDrillCheckResponse`

- `correct: boolean`
- `feedback`: what worked / what to fix, naming the connective + tense.
- `modelAnswer`: revealed now.

### Code units

- `server/src/brain/flow.ts` — `assembleFlowPrompt`, `assembleFlowDrillCheckPrompt`,
  `analyzeFlow()`, `checkFlowDrill()` (provider-injected, mirrors `prompts.ts`).
- `server/src/brain/schema.ts` — `flowAnalysisZ`, `flowDrillCheckZ` (tolerant, like
  the other schemas).
- `server/src/routes/flow.ts` — `POST /analyze`, `POST /drill/check`. Uses
  `deps.utilityProvider`, `config.modelUtility`, and the vocab DAL to seed drills.
- `shared/types.ts` — `FlowLine`, `FlowAnalysisResponse`, `FlowDrill`,
  `FlowDrillCheckResponse`.
- `client/src/api.ts` — `analyzeFlow()`, `checkFlowDrill()`.
- `client/src/components/FlowCoach.tsx` — draft input, line cards, drill loop.
- `client/src/App.tsx` — new tab/mode.
- `server/src/index.ts` — mount `/api/flow`.

## Error handling

- Draft segmentation is done by the LLM (returns the ordered `lines` array);
  validate with zod. On parse failure, return a friendly error (route try/catch,
  like other routes).
- Drill grading uses tolerant zod; malformed output falls back to revealing the
  model answer with generic feedback.
- Minimum draft length enforced; empty/too-short → 400 with a clear message.
- Each drill check is independent; a failure affects only that card.

## Testing

- `server/tests/flow.test.ts` — prompt assembly (draft + previous-sentence framing
  + vocab list present; drill-check prompt shape) and schema parsing.
- `server/tests/api.test.ts` — `/analyze` returns structured lines and `/drill/check`
  grades, both with a mocked provider and injected vocab.
- `client/tests/flowCoach.test.tsx` — renders line cards (pieces → rewrite → why →
  drill) and the write-your-own → check → reveal loop, with mocked api.

## Out of scope (v1 / YAGNI)

- Persisting flow analyses or drill history.
- Speaking mode integration.
- Auto-importing drill results into the mistake tally or SM-2 review.
