# Idiomate Update and History Progress

## 2026-06-29 Speaking review module design checkpoint

Purpose: add a dedicated text-only speaking review workflow for speech-to-text transcripts, while keeping the output in Idiomate history, profile memory, and the Chrome side-panel reading flow.

Decision:

- Build a new web `Speak` tab and a Chrome side-panel `Speak` mode.
- First version consumes STT text from any tool; it does not record audio or judge pronunciation, tone, pace, or flow.
- Store reviews as `sessions.source = 'speaking_review'` with annotations, native spoken version, and optional reading context.
- Preserve webpage reading context in Chrome by carrying page title, URL, and selected excerpt into speaking reviews.
- Tag vocabulary captured from webpages as `website_reading` so reading vocabulary and spoken thoughts about the same reading can be distinguished later.

Design spec:

- `docs/superpowers/specs/2026-06-29-speaking-review-design.md`

Validation status:

- Design document written for user review.
- Implementation not started yet.

Next steps:

1. User reviews the spec.
2. After approval, create an implementation plan.
3. Implement the web tab, server route, history integration, Chrome side-panel mode, and tests.

## 2026-06-29 MacBook migration checkpoint

Purpose: make the active Idiomate v3 work movable to the MacBook through GitHub, while keeping secrets and local state out of git.

Current source checkout:

- Windows path: `D:\dev\idiomate`
- GitHub repo: `https://github.com/DWSDavid/idiomate.git`
- Active branch: `codex/idiomate-v3`
- Remote tracking branch: `origin/codex/idiomate-v3`
- Local status at checkpoint: branch is aligned with origin, no unpushed commits, no uncommitted tracked files

MacBook restore path:

```bash
git clone https://github.com/DWSDavid/idiomate.git
cd idiomate
git checkout codex/idiomate-v3
npm install
npm run dev
```

Hand-carry or recreate on the MacBook:

- `.env` with local development secrets and model settings
- `server/idiomate.sqlite` if you want the exact local writing/vocab history
- `Vocabs.txt` if you want the owner vocabulary seed file

Do not commit these files. They are intentionally gitignored.

Render deployment notes:

- `render.yaml` is tracked in git and moves with the repository.
- Render builds from GitHub pushes; the MacBook does not need to build production.
- Existing Render secrets live in the Render dashboard, not the repo.
- Re-enter `OPENAI_API_KEY`, `ACCESS_CODE`, `OWNER_VOCAB_CODE`, `RUBI_PROFILE_CODE`, and `ADMIN_CODE` only if a brand-new Render service is created.

Ongoing development rule:

1. Work on a branch.
2. Keep docs and implementation in the same commit when a decision changes project direction.
3. Run the relevant checks before pushing.
4. Push to GitHub so the MacBook and Windows checkouts can both continue from the same source of truth.
5. Update this file after meaningful milestones, migrations, deploy changes, data migrations, or rollback decisions.
