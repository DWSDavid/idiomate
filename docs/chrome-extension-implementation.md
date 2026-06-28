# Idiomate Chrome Side Panel Extension — Implementation Doc

**Status:** ready to implement
**Owner split:** `[CODEX]` writes nearly everything. `[YOU]` only does the steps Chrome forces a human to do (loading the unpacked extension, copying its ID, the live smoke test).
**Effort:** ~1–2 focused sessions. No new backend logic except one CORS block.

---

## 1. What we are building

A Manifest V3 Chrome extension that adds a **side panel**. You highlight text on any webpage:

- **One word** → panel runs the existing **Word Capture** flow → `POST /api/vocab/capture` then `POST /api/vocab/save`.
- **A phrase / sentence** → panel runs the existing **Sentence Lab** flow → `POST /api/sentence-lab/diagnose`, you rewrite, `POST /api/sentence-lab/result`.

Same backend as the website (`https://idiomate.onrender.com`), same access code (`Rubi8`). Philosophy preserved: **AI diagnoses, you rewrite.** No auto-fix, no DOM injection into the page.

The final deliverable is an unpacked extension folder (`extension/dist`). You `Load unpacked` it once in `chrome://extensions` and it lives in your browser.

---

## 2. Key design decisions (already settled)

| Decision | Choice | Why |
|---|---|---|
| UI style | Chrome **side panel**, not Grammarly-style inline | Inline = canvas/DOM nightmare (6–10 wks) and wrong for our "you rewrite" model |
| Panel UI | **Reuse existing React components** via a small Vite build | `SentenceLab.tsx` and `CaptureWord.tsx` already do exactly this work |
| Location | New `extension/` folder **inside** `D:\dev\idiomate` | Shares components, types, and `api.ts` with zero duplication |
| API base URL | Add a `VITE_API_BASE` shim to `client/src/api.ts` | Backward-compatible: web app stays relative, extension points at Render |
| Auth | Reuse `AccessGate.tsx` + `localStorage` | Side panel pages have their own `localStorage`; existing `getStoredAccessCode`/`saveAccessCode` work unchanged |
| Backend | One `cors` block added before the access middleware | Cross-origin calls from `chrome-extension://` need CORS; nothing else changes |

---

## 3. Repo facts Codex must respect (verified)

- Single root `package.json` (`type: module`, no workspaces). Vite root is `client`, build output is `client/dist`.
- Tailwind **v3**, one config at root: `D:\dev\idiomate\tailwind.config.js` (`content` currently scans `./client/...` only).
- Styling lives in `client/src/styles.css` and defines custom component classes (`surface`, `field`, `btn-primary`, `chip`, etc.) via `@layer`. The reused components depend on these.
- `cors` is **not** installed. The website is same-origin, so it never needed it.
- `server/src/middleware/access.ts` returns **401** when `x-access-code` is missing or wrong. A CORS preflight `OPTIONS` has no such header, so **`cors` MUST be mounted before** `app.use('/api', accessMiddleware(...))` in `server/src/index.ts:50`.
- Real component signatures:
  - `SentenceLab({ onRecorded?: () => void })` — imports `diagnoseSentenceLab`, `revealSentenceLabResult` from `../api`.
  - `CaptureWord({ onSaved?: (vocab: Vocab) => void })` — imports `captureWord`, `getWordDeepDive`, `saveVocab` from `../api`.
  - `AccessGate({ onSubmit: (code: string) => void })`.
- API calls add headers `x-user-id`, `x-user-name`, and (if set) `x-access-code` via `identityHeaders` in `client/src/api.ts`. These all read from `localStorage`, which works in the panel.

---

## 4. Architecture / data flow

```
 webpage                          extension                              backend (Render)
 ┌─────────┐   mouseup/selection   ┌────────────┐                        ┌──────────────────┐
 │ content │ ────────────────────▶ │ content.js │                        │ idiomate.onrender│
 │  text   │                       └─────┬──────┘                        │      .com        │
 └─────────┘                             │ chrome.storage.local.set      └────────▲─────────┘
                                         │  + runtime.sendMessage                 │
                                         ▼                                        │ fetch + CORS
 toolbar icon click ──▶ background.js ──▶ opens side panel                        │ x-access-code
                                         │                                        │
                                         ▼                                        │
                                ┌──────────────────┐   reuses    ┌───────────────┴───┐
                                │ sidepanel App.tsx │ ──────────▶ │ SentenceLab /     │
                                │ (AccessGate +      │            │ CaptureWord       │
                                │  auto-detect)      │            │ (existing comps)  │
                                └──────────────────┘             └───────────────────┘
```

**Selection handoff (robust to panel open/closed timing):** `content.js` writes the latest selection to `chrome.storage.local` (key `idiomate_pending_selection`, with a timestamp) **and** fires a `runtime` message. The panel reads the key on mount and also subscribes to `chrome.storage.onChanged`, so it works whether the panel was already open or just opened.

**Word vs phrase detection:** `trimmed.split(/\s+/).length === 1 && trimmed.length <= 40` → Word Capture; else Sentence Lab.

---

## 5. Target file layout

```
D:\dev\idiomate\
├── client/src/api.ts                 # [CODEX] add VITE_API_BASE shim (only edit to existing client code)
├── server/src/index.ts               # [CODEX] add cors block before access middleware
├── tailwind.config.js                # [CODEX] add extension paths to content globs
├── package.json                      # [CODEX] add cors, @types/cors, @types/chrome, build:ext script
└── extension/
    ├── manifest.json                 # [CODEX]
    ├── vite.config.ts                # [CODEX]
    ├── public/                       # copied verbatim into dist/ by Vite
    │   ├── background.js             # [CODEX] service worker
    │   ├── content.js               # [CODEX] selection listener
    │   ├── icon-16.png  icon-48.png  icon-128.png   # [YOU] drop in (reuse logo-icon.png resized)
    │   └── manifest.json            # see note in Phase 1 — manifest must land in dist root
    ├── sidepanel/
    │   ├── index.html               # [CODEX]
    │   ├── main.tsx                  # [CODEX] imports client styles.css
    │   └── App.tsx                   # [CODEX] AccessGate + auto-detect + reused components
    └── dist/                         # build output → Load unpacked target
```

> Note on `manifest.json` placement: with Vite, the simplest reliable approach is to keep `manifest.json`, `background.js`, `content.js`, and icons in `extension/public/`. Vite copies everything in `publicDir` to `dist/` root on build. The panel HTML is the Vite entry and builds to `dist/sidepanel/index.html`.

---

## 6. Implementation phases

Each phase ends in a checkpoint you can verify before moving on.

### Phase 1 — Scaffold + load a hello-world panel `[CODEX]` then `[YOU]`

1. `[CODEX]` Create `extension/` with the layout above.
2. `[CODEX]` `extension/public/manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "Idiomate",
     "version": "0.1.0",
     "description": "Highlight any English on the web — capture words, diagnose sentences.",
     "permissions": ["sidePanel", "activeTab", "storage", "contextMenus"],
     "host_permissions": ["https://idiomate.onrender.com/*"],
     "background": { "service_worker": "background.js" },
     "action": { "default_title": "Open Idiomate" },
     "side_panel": { "default_path": "sidepanel/index.html" },
     "content_scripts": [
       { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }
     ],
     "icons": { "16": "icon-16.png", "48": "icon-48.png", "128": "icon-128.png" }
   }
   ```
3. `[CODEX]` `extension/vite.config.ts`:
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { resolve } from 'node:path';

   export default defineConfig({
     root: __dirname,
     publicDir: 'public',
     plugins: [react()],
     build: {
       outDir: 'dist',
       emptyOutDir: true,
       rollupOptions: { input: resolve(__dirname, 'sidepanel/index.html') },
     },
   });
   ```
4. `[CODEX]` `extension/sidepanel/index.html`, `main.tsx`, and a placeholder `App.tsx` that just renders "Idiomate panel works". `main.tsx` must `import '../../client/src/styles.css'`.
5. `[CODEX]` `extension/public/background.js` minimal:
   ```js
   chrome.runtime.onInstalled.addListener(() => {
     chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
   });
   ```
6. `[CODEX]` Empty `extension/public/content.js` for now (filled in Phase 2).
7. `[CODEX]` Update root `tailwind.config.js` `content` to include the extension + ensure reused components are scanned:
   ```js
   content: [
     './client/index.html',
     './client/src/**/*.{ts,tsx}',
     './extension/sidepanel/**/*.{ts,tsx}',
   ],
   ```
8. `[CODEX]` Add to root `package.json`: devDeps `@types/chrome`; script `"build:ext": "vite build --config extension/vite.config.ts"`. Run `npm install`, then `npm run build:ext`. Confirm `extension/dist/sidepanel/index.html`, `dist/manifest.json`, `dist/background.js` exist.
9. `[YOU]` Create three icon PNGs (16/48/128) from `client/public/logo-icon.png` and drop them in `extension/public/`. (Codex can stub 1×1 transparent PNGs so the build is valid; you replace them.)
10. `[YOU]` `chrome://extensions` → Developer mode ON → **Load unpacked** → select `D:\dev\idiomate\extension\dist`. Click the toolbar icon → side panel opens showing "Idiomate panel works".

**Checkpoint:** panel opens. Note the **extension ID** shown on the card — paste it to Codex if you want the CORS allowlist locked to it (optional; see Phase 4).

### Phase 2 — Selection plumbing `[CODEX]`

1. `[CODEX]` `content.js`: on `mouseup`, read `window.getSelection()`, trim; if non-empty, `chrome.storage.local.set({ idiomate_pending_selection: { text, ts: Date.now() } })` and `chrome.runtime.sendMessage({ type: 'idiomate-selection', text }).catch(() => {})`.
2. `[CODEX]` `background.js`: add a `contextMenus` item "Send to Idiomate" (`contexts: ['selection']`) that, on click, stores `info.selectionText` the same way and calls `chrome.sidePanel.open({ windowId })`. This is the fallback path when auto-selection misses.
3. `[CODEX]` In the panel, add a tiny hook `usePendingSelection()` that (a) reads `idiomate_pending_selection` on mount, (b) subscribes to `chrome.storage.onChanged`, and returns the latest text. For now just render the captured text in the placeholder.

**Checkpoint:** `[YOU]` reload the extension, highlight text on any page → the panel shows the highlighted text live.

### Phase 3 — Wire the real components `[CODEX]`

1. `[CODEX]` Add the `VITE_API_BASE` shim to `client/src/api.ts` (see §7). Verify the web app still builds and behaves identically (relative URLs when the var is unset).
2. `[CODEX]` Create `extension/.env` with `VITE_API_BASE=https://idiomate.onrender.com`.
3. `[CODEX]` `extension/sidepanel/App.tsx`:
   - If `getStoredAccessCode()` is empty → render `AccessGate` (`onSubmit` → `saveAccessCode(code)` then re-render).
   - Else: take pending selection, auto-detect word vs phrase, and render `CaptureWord` (seed its word field) or `SentenceLab` (seed its sentence field). Both come from `../../client/src/components/...`.
   - Provide a manual textarea fallback so the panel is usable without a selection, and a small "mode toggle" (Word / Sentence) in case detection guesses wrong.
   - Reuse the components' own success states (`onSaved`, `onRecorded`).

   > Seeding existing component state: `SentenceLab`/`CaptureWord` hold their input in internal `useState`. Easiest reliable approach is to pass an optional `initialValue` prop and seed `useState(initialValue ?? '')` — a 1-line change to each component, backward-compatible. Add `initialWord?` to `CaptureWord` and `initialSentence?` to `SentenceLab`. (Alternative without touching components: remount with a `key` and rely on a thin wrapper — but the prop is cleaner.)

**Checkpoint:** `[YOU]` highlight a word → panel enriches + saves to vocab (verify it appears in the website's Words tab). Highlight an awkward sentence → panel diagnoses, you rewrite, reveal works.

### Phase 4 — CORS + polish `[CODEX]`

1. `[CODEX]` `npm i cors` and `npm i -D @types/cors`. In `server/src/index.ts`, mount CORS **before** the access middleware (see §8).
2. `[CODEX]` Decide allowlist: either reflect any `chrome-extension://` origin, or lock to the exact ID from your Phase 1 checkpoint. Include `https://idiomate.onrender.com` so the website still works. Allow headers `Content-Type`, `x-access-code`, `x-user-id`, `x-user-name`.
3. `[CODEX]` Add an error/empty state to the panel: cold-start spinner copy ("Waking the server, ~20s on first request"), and a 401 handler that clears the stored code and shows `AccessGate` again (the app already dispatches `ACCESS_DENIED_EVENT`).
4. `[CODEX]` Update `README` / this doc's "How you load it" section if anything changed.

**Checkpoint:** `[YOU]` deploy server change to Render (or test against local server), reload extension, run both flows end to end against the live backend. No CORS errors in the panel's devtools console.

---

## 7. The `client/src/api.ts` shim (exact change)

Add near the top, after the imports:

```ts
// Empty for the same-origin web build; the extension build sets VITE_API_BASE
// to https://idiomate.onrender.com so the panel can reach the backend cross-origin.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
```

Then in `apiFetch`, prefix the URL:

```ts
function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(API_BASE + url, {
    ...init,
    headers: identityHeaders(init.headers),
  });
}
```

Also prefix the one direct `fetch`-style call paths that bypass `apiFetch` if any exist — grep for `fetch(` and `apiFetch(` in `api.ts`; currently all go through `apiFetch`/`postJson`, so this single edit covers everything. `postJson` and `importVocab` both route through `apiFetch`, so they inherit the base automatically.

No other client file changes (beyond the optional `initialValue` props in Phase 3).

---

## 8. The `server/src/index.ts` CORS block (exact placement)

At the top of `createApp`, right after `const app = express();` and **before** `app.use('/api', accessMiddleware(...))` (currently line 50):

```ts
import cors from 'cors';
// ...
const app = express();
app.use(cors({
  origin: (origin, cb) => {
    // Allow the website itself, any Chrome extension origin, and tools with no origin.
    if (!origin
      || origin === 'https://idiomate.onrender.com'
      || origin.startsWith('chrome-extension://')) {
      return cb(null, true);
    }
    return cb(null, false);
  },
  allowedHeaders: ['Content-Type', 'x-access-code', 'x-user-id', 'x-user-name'],
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', accessMiddleware(config.accessCode));
// ...unchanged below
```

This makes the preflight `OPTIONS` succeed before the access middleware can 401 it. To lock to a single extension ID instead, replace the `startsWith` check with `origin === 'chrome-extension://<your-id>'`.

---

## 9. How you load and use it (recap for `[YOU]`)

1. `npm run build:ext` (Codex wires this; you just run it after pulling changes).
2. `chrome://extensions` → Developer mode ON → **Load unpacked** → pick `D:\dev\idiomate\extension\dist`.
3. Pin the icon. Click it → side panel opens. Enter access code `Rubi8` once.
4. Highlight a word on BBC/NYT → it's captured + saved to your vocab. Highlight an off-sounding sentence → diagnose, rewrite, reveal.
5. After any code change, re-run `build:ext` and hit the **reload** ↻ icon on the extension card.

**Caveats (expected, not bugs):** stays in developer/unpacked mode (fine for personal use; Web Store publishing is out of scope); first request after idle cold-starts the free Render backend in ~20–30s.

---

## 10. Out of scope (do not build)

- Grammarly-style inline overlays / page DOM annotation.
- Chrome Web Store packaging, listing, or review.
- Any new backend endpoint or schema change.
- Offline mode, auth beyond the existing access code.

---

## 11. Test checklist before calling it done

- [ ] `npm test` still green (api.ts shim must not break existing 182 tests).
- [ ] Web app at `idiomate.onrender.com` behaves identically (relative URLs preserved).
- [ ] `npm run build:ext` produces a loadable `extension/dist`.
- [ ] Panel: access gate → store code → both flows work against live backend.
- [ ] Word capture result shows up in the website's Words tab (same account/identity).
- [ ] No CORS errors in panel devtools; OPTIONS preflight returns 204.
- [ ] 401 path re-prompts for the access code.
```
