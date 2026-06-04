# Idiomate

Local-first English writing companion for an advanced Chinese-L1 writer. The app runs on your machine with a Vite/React client, an Express server, and local SQLite. The browser never receives your OpenAI API key.

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create `D:\dev\idiomate\.env`:

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL_COACH=gpt-4o
OPENAI_MODEL_UTILITY=gpt-4o-mini
PORT=8787
```

`.env` is ignored by git. Keep the key only in this local file.

3. Start the app:

```powershell
npm run dev
```

Then open `http://127.0.0.1:5173/`.

## Import Vocab

The Youdao export can be imported through the local API. From `D:\dev\idiomate`:

```powershell
Invoke-WebRequest `
  -Uri http://localhost:8787/api/vocab/import `
  -Method POST `
  -ContentType "text/plain; charset=utf-8" `
  -InFile .\Vocabs.txt
```

The importer deduplicates by normalized word or phrase and increments capture counts on repeated entries.

## Writing Loop

1. Start from the daily prompt.
2. Write one or more paragraphs in the Draft area.
3. Use Coach for each paragraph you want reviewed.
4. Read annotations and hints first. Idiomate does not edit your draft automatically.
5. Click Rewrite, submit your own rewrite, then compare against the hidden model rewrite and explanation.
6. Save Session to update the local error profile and vocab activation stats.

## Quick Capture

Use the Quick Capture area for a word, phrase, or collocation you saw elsewhere. Capture asks the utility model for enrichment, shows editable fields, and Save writes the final version through `/api/vocab/save`.

## Provider Swap

LLM access is isolated behind `server/src/brain/provider.ts`. To swap providers, implement `LLMProvider.complete(...)` and wire it in `server/src/index.ts` or pass it through `createApp(...)` in tests. The `brain/` module does not import Express or React.

## Verification

Current automated checks:

```powershell
npx vitest run
npm run build
```

Latest local run: `28 passed / 0 failed`, build passed.

Manual smoke path after adding `.env`:

1. `npm run dev`
2. Import `Vocabs.txt`
3. Open `http://127.0.0.1:5173/`
4. Confirm the prompt and vocab prime load
5. Write two paragraphs
6. Coach each paragraph
7. Submit your own rewrites
8. Save Session
9. Confirm Profile updates with recurring errors and vocab activation
