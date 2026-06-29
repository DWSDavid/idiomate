# Idiomate Speaking Review Module - Design Spec

**Date:** 2026-06-29
**Status:** User-approved design, written for final review before implementation
**Scope:** Add a dedicated Speak workflow to the Idiomate web app and Chrome side panel. The first version consumes speech-to-text output as text, reviews expression quality, and saves the result into Idiomate history and memory.

---

## 1. Problem

Idiomate already supports deliberate writing practice, Sentence Lab, vocabulary capture, and Chrome-side reading capture. The missing use case is the user's everyday spoken output after it has been transcribed by a speech-to-text tool such as macOS dictation, Doubao input method, RAGFlow, or a local Riffado pack.

The user does not need pronunciation, tone, or speaking-flow feedback in this module. The pain is language accuracy after transcription:

- grammar problems that show up in spontaneous speech
- unnatural or translated phrasing
- word choice that is close but not precise
- expressions that would sound more native in a real spoken context
- recurring spoken-English patterns that should join the same Idiomate memory loop as writing mistakes

The module should treat spoken transcript review as related to writing review, but not identical. Spoken English can be looser, more direct, and more conversational than polished essay prose.

---

## 2. Goals

1. Add a **Speak** tab to the web app for pasting speech-to-text transcript text.
2. Add a **Speak** mode to the Chrome side panel so the user can paste or type transcribed spoken thoughts while reading a webpage.
3. Analyze transcripts for grammar, precision, naturalness, native spoken phrasing, and Chinese-L1 transfer.
4. Save every reviewed transcript into Idiomate history as `speaking_review`.
5. Feed saved speaking review annotations into the existing profile, mistake tally, progress, and memory retrieval systems.
6. Preserve reading context when a speaking note is tied to a webpage, so "words from reading" and "spoken thoughts about this reading" stay connected.
7. Keep the first version text-only. STT tools provide the text; Idiomate reviews the result.

---

## 3. Non-Goals

- No direct audio recording.
- No microphone permission.
- No pronunciation scoring.
- No tone, pace, intonation, or fluency analysis.
- No automatic connection to RAGFlow, Riffado, Doubao, or macOS dictation APIs.
- No Chrome Web Store packaging.
- No Grammarly-style page overlay.

These can come later, but the first version should be fast, durable, and useful with any STT text source.

---

## 4. Product Shape

### Web App: Speak Tab

The main app gets a new top-level `Speak` tab next to `Write`, `Lab`, `Words`, `Review`, `Me`, and `Patterns`.

The tab contains:

- transcript textarea: "Paste speech-to-text output"
- context field: optional situation, audience, or intent
- context label control: standalone thought, meeting note, interview answer, reading reaction
- `Analyze transcript` button
- result area with issue cards and a native spoken version

The review runs once and saves automatically when the backend returns a valid analysis. Unlike Sentence Lab, the MVP does not force a pre-reveal rewrite step. The user is reviewing real spoken output after the fact, so the fastest useful loop is:

`paste transcript -> analyze -> read native spoken version -> history/profile updated`

### Chrome Side Panel: Speak Mode

The existing Chrome side panel already supports webpage selection handoff, word capture, and Sentence Lab. It should gain a third mode:

- `Word`: capture a selected word or phrase from the page.
- `Sentence`: diagnose a selected sentence from the page.
- `Speak`: paste or type a speech-to-text transcript about the current reading.

When the panel has page context, Speak mode carries it into the request:

- current page title
- current page URL
- selected excerpt, when present
- optional user-entered note/context

This supports the natural reading flow:

1. Read a webpage.
2. Capture useful words or chunks from the page.
3. Speak a short thought, reaction, summary, or feedback about the reading through any STT tool.
4. Paste the transcript into the side panel Speak mode.
5. Idiomate reviews the spoken English and stores it as a speaking review linked to that reading context.

---

## 5. AI Behavior

Create a speaking-specific prompt rather than reusing the essay coach prompt unchanged.

The speaking coach should:

- act as an English spoken-expression coach for an advanced Chinese-L1 user
- focus on whether the transcript is natural, precise, grammatical, and idiomatic when spoken
- preserve good conversational directness instead of turning everything into formal writing
- ignore disfluencies that are only STT artifacts unless they affect meaning
- call out grammar and word-choice issues using the existing `ERROR_TYPES`
- produce a native spoken version of the whole transcript
- provide compact explanations that teach the pattern
- avoid over-polishing into essay prose

The model response should use existing `Annotation` shape where possible:

- `span`
- `errorType`
- `rule`
- `hint`
- `explanation`
- `modelRewrite`
- `ruleExample`
- `vocabWord` and `distinction` when useful

The response also includes:

- `nativeVersion`: a natural spoken version of the transcript
- `takeaways`: 2 to 4 short points for what to say differently next time

---

## 6. Data Model

Reuse existing tables where possible.

### Sessions

Speaking reviews are stored in `sessions`:

- `source = 'speaking_review'`
- `draft_text = original transcript`
- `final_text = native spoken version`
- `date = provided date or current date`

Add optional context columns to `sessions` through migration:

- `context_label TEXT`
- `context_title TEXT`
- `context_url TEXT`
- `context_excerpt TEXT`

These columns support both web and extension contexts without creating a separate table. They are optional and do not affect existing writing sessions.

### Annotations

Speaking issues are stored in `annotations` against the speaking session:

- `paragraph_idx = 0` for the whole transcript
- same annotation fields as writing coach
- `accepted = 1` because the review is automatically accepted as a saved diagnostic record

### Vocab Source

Website-side word capture should keep using the existing `vocab` table. For words captured from the Chrome side panel while reading, the saved vocab `source` should be `website_reading` instead of generic `capture`.

The existing `context_sentence` field should store the selected sentence or a compact page-context string. This gives the vocabulary page enough information to distinguish words met while reading from words entered manually.

---

## 7. API Design

Add a new route:

`POST /api/speaking/review`

Request:

```json
{
  "transcript": "string",
  "context": "optional user note",
  "contextLabel": "optional label such as reading_reaction",
  "contextTitle": "optional page or article title",
  "contextUrl": "optional page URL",
  "contextExcerpt": "optional selected excerpt",
  "date": "optional ISO date"
}
```

Response:

```json
{
  "id": 123,
  "transcript": "original transcript",
  "nativeVersion": "natural spoken version",
  "annotations": [],
  "takeaways": [],
  "context": {
    "label": "reading_reaction",
    "title": "page title",
    "url": "https://example.com",
    "excerpt": "selected excerpt"
  }
}
```

The route performs the full workflow:

1. collect tallies and memory snippets like `coach` and `sentence-lab`
2. call the speaking coach prompt
3. attach book references where relevant
4. insert a `speaking_review` session
5. insert annotations
6. update `error_tally`
7. write a session embedding when the embedding provider is available
8. return the saved review

---

## 8. History and Profile

History should show `speaking_review` entries with a friendly label such as `Speaking review`.

Each history card should show:

- original transcript
- native spoken version
- annotation chips
- page title and URL when available
- context excerpt when available

Profile and progress should include speaking mistakes by default. That is intentional: the user's recurring spoken-expression problems should join the same learning profile as writing problems.

If the user later wants separate analytics, we can filter by `source`, but first version should optimize for one unified memory layer.

---

## 9. UI Design

### Speak Tab

The Speak tab should feel like a working tool, not a landing page.

Expected layout:

- left or top input surface with transcript and context
- analyze button with loading state
- result surface with native spoken version
- issue cards using the same annotation language as Coach and Sentence Lab
- short takeaways area

Copy should stay practical:

- "Paste speech-to-text output"
- "Analyze transcript"
- "Native spoken version"
- "What to say differently next time"

### Chrome Side Panel

The side panel adds a three-way mode control:

- Word
- Sentence
- Speak

Speak mode should show the current page context when available and allow the user to paste a transcript. It should not try to access the microphone or clipboard automatically.

---

## 10. Error Handling

- Empty transcript: disable analyze.
- Very long transcript: client warns and server caps model input to a safe length.
- LLM failure: show a recoverable error and do not write partial history.
- Invalid model JSON: return a 500-style error through the existing error middleware.
- Embedding failure: log and continue; history save must still succeed.
- Missing page context: save as a standalone speaking review.

---

## 11. Testing Plan

Server:

- prompt unit test validates speaking response parsing
- API route test with mocked LLM verifies session save, annotations, tallies, history entry, and embedding fallback
- DAL test verifies `speaking_review` appears in `getWritingHistory`
- migration test verifies new context columns are added

Client:

- `SpeakingReview` component test covers input, API call, loading state, result rendering, and error state
- `App` test verifies the `Speak` tab appears and can be opened
- `HistoryPanel` test verifies friendly source label and context link rendering

Extension:

- side-panel test verifies Speak mode exists
- context handoff test verifies page metadata is passed into speaking review
- build check verifies `npm run build:ext`

Full checks before completion:

- `npm test`
- `npm run build`
- `npm run build:ext`

---

## 12. Implementation Order

1. Shared types and schema updates.
2. Speaking prompt and brain function.
3. DB migration and DAL helpers for session context.
4. `/api/speaking/review` route and app wiring.
5. Web `SpeakingReview` component and `Speak` tab.
6. History label/context rendering.
7. Chrome side-panel Speak mode and page metadata handoff.
8. Vocab capture source tagging for `website_reading`.
9. Tests and docs.

---

## 13. Acceptance Criteria

- The web app has a `Speak` tab.
- The Chrome side panel has a `Speak` mode.
- A pasted STT transcript can be analyzed without audio input.
- The result includes a native spoken version and actionable annotations.
- The review is saved to History as `Speaking review`.
- Speaking review mistakes update the user's profile and progress.
- Speaking reviews from the extension can carry page title, URL, and excerpt.
- Words captured from webpages can be saved with source `website_reading`.
- Existing Write, Lab, Words, Review, Me, Patterns, and extension Word/Sentence flows keep working.
