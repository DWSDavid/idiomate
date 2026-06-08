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
OPENAI_MODEL_UTILITY=gpt-4o
ACCESS_CODE=
DB_PATH=server/idiomate.sqlite
SEED_VOCAB_PATH=server/seed/vocab.txt
AUTO_SEED_VOCAB=false
OWNER_VOCAB_PATH=Vocabs.txt
OWNER_VOCAB_CODE=choose-an-owner-vocab-code
RUBI_PROFILE_CODE=choose-a-rubi-profile-code
RUBI_PROFILE_USER_ID=rubi
RUBI_PROFILE_NAME=Rubi
ADMIN_CODE=choose-an-admin-code
PORT=8787
```

`.env` is ignored by git. Keep the key only in this local file.

3. Start the app:

```powershell
npm run dev
```

Then open `http://127.0.0.1:5173/`.

For a production-like single-origin run:

```powershell
npm run build
npm start
```

Then open `http://127.0.0.1:8787/`. The built client and `/api` routes are served from the same port.

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

## Deploy on Render

Idiomate is a stateful Node app backed by SQLite, so deploy it to a Node host with a persistent disk. Do not deploy this app to a serverless host where the filesystem is reset between requests.

The repo includes `render.yaml` for Render. It builds the Dockerfile, mounts a persistent disk at `/data`, and sets `DB_PATH=/data/idiomate.sqlite` so SQLite survives deploys and restarts.

Required production environment variables:

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL_COACH=gpt-4o
OPENAI_MODEL_UTILITY=gpt-4o
ACCESS_CODE=choose-a-private-code
DB_PATH=/data/idiomate.sqlite
SEED_VOCAB_PATH=/app/server/seed/vocab.txt
AUTO_SEED_VOCAB=false
OWNER_VOCAB_PATH=/app/Vocabs.txt
OWNER_VOCAB_CODE=choose-an-owner-vocab-code
RUBI_PROFILE_CODE=choose-a-rubi-profile-code
RUBI_PROFILE_USER_ID=rubi
RUBI_PROFILE_NAME=Rubi
ADMIN_CODE=choose-an-admin-code
PORT=10000
```

Deploy steps:

1. Push this branch to GitHub.
2. In Render, create a new Blueprint from the repo and use `render.yaml`.
3. Confirm the service uses Docker and the disk `idiomate-data` is mounted at `/data`.
4. Set `OPENAI_API_KEY` as a secret value.
5. Set `ACCESS_CODE` as a secret value. Use a short private code you can send to testers.
6. Set `OWNER_VOCAB_CODE`, `RUBI_PROFILE_CODE`, and `ADMIN_CODE` as secret values if you want to override the local defaults.
7. Keep `DB_PATH=/data/idiomate.sqlite`, `SEED_VOCAB_PATH=/app/server/seed/vocab.txt`, `AUTO_SEED_VOCAB=false`, `OWNER_VOCAB_PATH=/app/Vocabs.txt`, `RUBI_PROFILE_USER_ID=rubi`, `RUBI_PROFILE_NAME=Rubi`, `OPENAI_MODEL_COACH=gpt-4o`, `OPENAI_MODEL_UTILITY=gpt-4o`, and `PORT=10000`.
8. The Vocabulary page can switch to Rubi's profile with `RUBI_PROFILE_CODE` and automatically import the owner vocabulary file for that profile.
9. Deploy, then open the Render service URL.

Share the Render URL and access code with peers. Each peer enters the access code, then each peer enters a name. Their browser generates a private `idiomate_uid`, and the server stores vocab, sessions, mistakes, and Sentence Lab data separately for that user.

New users start with an empty private vocabulary by default. If `AUTO_SEED_VOCAB=true`, new users receive seed vocabulary from `SEED_VOCAB_PATH`; otherwise, the owner can use the Vocabulary page's Rubi profile code to switch into the stable Rubi profile and copy `OWNER_VOCAB_PATH` into Rubi's private vocab table. The import only adds missing normalized terms, so repeated imports do not inflate capture counts.

Use the History page to review saved Daily Writing and Sentence Lab trials. Use the Admin page with `ADMIN_CODE` to inspect users, vocab lists, and writing history.

## Verification

Current automated checks:

```powershell
npx vitest run
npm run build
```

Latest local run: `96 passed / 0 failed`, build passed.

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

Latest real smoke result:

- Imported `Vocabs.txt`: 2716 parsed entries
- Quick Capture enriched and saved `shore up`
- Coached two paragraphs with real `gpt-4o` responses
- Confirmed `/api/coach` did not update `error_tally`
- Submitted a session and confirmed Profile tallies updated
