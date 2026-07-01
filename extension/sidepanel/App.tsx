import React, { useEffect, useState } from 'react';
import { ACCESS_DENIED_EVENT, getStoredAccessCode, saveAccessCode, switchToRubiProfile } from '../../client/src/api';
import { setClientIdentity } from '../../client/src/identity';
import { AccessGate } from '../../client/src/components/AccessGate';
import { CaptureWord } from '../../client/src/components/CaptureWord';
import { SentenceLab } from '../../client/src/components/SentenceLab';
import { SpeakingReview } from '../../client/src/components/SpeakingReview';

// The side panel is a single-tenant surface for the shared "Rubi" vocab list: the extension
// page and the web app are different storage origins, so identity can only be bridged over
// the network (see activateRubiIdentity). Seeding it synchronously here, before any component
// mounts or fires a request, closes the race where an early fetch calls getClientIdentity()
// before the network switch resolves, falls back to a random UUID, and triggers a native
// prompt() asking for a name — silently splitting captures off into a disconnected identity.
setClientIdentity({ id: 'rubi', name: 'Rubi' });

type PendingSelection = {
  text: string;
  ts: number;
  title?: string;
  url?: string;
};

type SelectionContext = {
  ts: number;
  title?: string;
  url?: string;
};

type ActivePageSnapshot = {
  context: SelectionContext | null;
  selection: PendingSelection | null;
};

type Mode = 'word' | 'sentence' | 'speak';

const PENDING_SELECTION_KEY = 'idiomate_pending_selection';
const ACCESS_CODE_KEY = 'idiomate_access_code';
const COLD_START_COPY = 'Waking the server, ~20s on first request';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function hasChromeTabs(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.tabs?.query);
}

function hasChromeScripting(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.scripting?.executeScript);
}

function isPendingSelection(value: unknown): value is PendingSelection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const selection = value as Partial<PendingSelection>;
  return (
    typeof selection.text === 'string'
    && typeof selection.ts === 'number'
    && (selection.title === undefined || typeof selection.title === 'string')
    && (selection.url === undefined || typeof selection.url === 'string')
  );
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 500);
  } catch {
    return '';
  }
}

function toSelectionContext(selection: PendingSelection): SelectionContext {
  const title = selection.title?.trim();
  const url = normalizeUrl(selection.url);
  return {
    ts: selection.ts,
    title: title || undefined,
    url: url || undefined,
  };
}

function selectionFromPagePayload(value: unknown, fallback?: chrome.tabs.Tab): PendingSelection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<PendingSelection>;
  const text = payload.text?.trim();
  if (!text) {
    return null;
  }

  return {
    text,
    title: payload.title?.trim() || fallback?.title?.trim() || undefined,
    url: normalizeUrl(payload.url) || normalizeUrl(fallback?.url) || undefined,
    ts: typeof payload.ts === 'number' ? payload.ts : Date.now(),
  };
}

function contextFromTab(tab: chrome.tabs.Tab | undefined): SelectionContext | null {
  const title = tab?.title?.trim();
  const url = normalizeUrl(tab?.url);
  if (!title && !url) {
    return null;
  }

  return {
    ts: Date.now(),
    title: title || undefined,
    url: url || undefined,
  };
}

async function readSelectionFromTab(tab: chrome.tabs.Tab | undefined): Promise<PendingSelection | null> {
  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'idiomate-get-selection' });
    const selection = selectionFromPagePayload(response, tab);
    if (selection) {
      return selection;
    }
  } catch {
    // Some pages miss or block the content script; the activeTab grant can still
    // allow a direct one-shot read when the side panel was opened from that tab.
  }

  if (!hasChromeScripting()) {
    return null;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: window.getSelection()?.toString().trim() || '',
        title: document.title || '',
        url: window.location.href,
        ts: Date.now(),
      }),
    });
    return selectionFromPagePayload(result?.result, tab);
  } catch {
    return null;
  }
}

function usePendingSelection(): PendingSelection | null {
  const [selection, setSelection] = useState<PendingSelection | null>(null);

  useEffect(() => {
    if (!hasChromeStorage()) {
      return undefined;
    }

    chrome.storage.local.get(PENDING_SELECTION_KEY).then((items) => {
      const pending = items[PENDING_SELECTION_KEY];
      if (isPendingSelection(pending)) {
        setSelection(pending);
      }
    });

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName,
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const changedSelection = changes[PENDING_SELECTION_KEY]?.newValue;
      if (isPendingSelection(changedSelection)) {
        setSelection(changedSelection);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return selection;
}

function useActivePageSnapshot(): ActivePageSnapshot {
  const [snapshot, setSnapshot] = useState<ActivePageSnapshot>({ context: null, selection: null });

  useEffect(() => {
    if (!hasChromeTabs()) {
      return undefined;
    }

    let alive = true;
    const refresh = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!alive) {
          return;
        }

        const tabContext = contextFromTab(tab);
        setSnapshot({ context: tabContext, selection: null });

        const selection = await readSelectionFromTab(tab);
        if (!alive || !selection) {
          return;
        }

        setSnapshot({ context: toSelectionContext(selection), selection });
        if (hasChromeStorage()) {
          await chrome.storage.local.set({ [PENDING_SELECTION_KEY]: selection });
        }
      } catch {
        // Keep the side panel usable for manual entry if Chrome page access fails.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    const handleFocus = () => {
      void refresh();
    };
    const handleTabActivated = () => {
      void refresh();
    };
    const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url)) {
        void refresh();
      }
    };

    void refresh();
    globalThis.addEventListener?.('focus', handleFocus);
    document.addEventListener?.('visibilitychange', handleVisibilityChange);
    // The side panel is a persistent surface: switching tabs (or navigating within the
    // active tab) doesn't fire focus/visibilitychange on the panel itself, so without these
    // listeners the page context silently goes stale and never picks up the page you're on.
    chrome.tabs?.onActivated?.addListener?.(handleTabActivated);
    chrome.tabs?.onUpdated?.addListener?.(handleTabUpdated);

    return () => {
      alive = false;
      globalThis.removeEventListener?.('focus', handleFocus);
      document.removeEventListener?.('visibilitychange', handleVisibilityChange);
      chrome.tabs?.onActivated?.removeListener?.(handleTabActivated);
      chrome.tabs?.onUpdated?.removeListener?.(handleTabUpdated);
    };
  }, []);

  return snapshot;
}

function detectMode(text: string): Mode {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'word';
  }

  return trimmed.split(/\s+/).length <= 4 && trimmed.length <= 60 ? 'word' : 'sentence';
}

async function activateRubiIdentity(code: string) {
  // Identity itself is already seeded to 'rubi' at module load (see setClientIdentity call
  // above), so failures here only cost the owner-vocab import side effect, not correctness.
  // Logging keeps that visible instead of silently vanishing, since a persistent failure here
  // usually means the server's rubi/owner-vocab code no longer matches what this build sends.
  try {
    await switchToRubiProfile(code);
    return;
  } catch (err) {
    console.warn('[Idiomate] Rubi profile switch failed for the stored access code, retrying with default code.', err);
  }

  try {
    await switchToRubiProfile('rubi-vocab');
  } catch (err) {
    console.warn('[Idiomate] Rubi profile switch failed with the default code too; owner vocab import was skipped.', err);
  }
}

function usePendingRequests(): number {
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== 'function') {
      return undefined;
    }

    const trackedFetch: typeof fetch = (...args) => {
      setPendingRequests(count => count + 1);
      return Promise.resolve(originalFetch(...args)).finally(() => {
        setPendingRequests(count => Math.max(0, count - 1));
      });
    };

    globalThis.fetch = trackedFetch;
    return () => {
      if (globalThis.fetch === trackedFetch) {
        globalThis.fetch = originalFetch;
      }
    };
  }, []);

  return pendingRequests;
}

export default function App() {
  const pendingSelection = usePendingSelection();
  const activePageSnapshot = useActivePageSnapshot();
  const pendingRequests = usePendingRequests();
  const [hasAccess, setHasAccess] = useState(() => Boolean(getStoredAccessCode()));
  const [sourceText, setSourceText] = useState('');
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [modeOverride, setModeOverride] = useState<Mode | null>(null);

  useEffect(() => {
    const handleAccessDenied = () => {
      globalThis.localStorage?.removeItem(ACCESS_CODE_KEY);
      setHasAccess(false);
    };

    globalThis.addEventListener?.(ACCESS_DENIED_EVENT, handleAccessDenied);
    return () => globalThis.removeEventListener?.(ACCESS_DENIED_EVENT, handleAccessDenied);
  }, []);

  useEffect(() => {
    const code = getStoredAccessCode();
    if (!code) {
      return;
    }

    void activateRubiIdentity(code);
  }, []);

  useEffect(() => {
    const activeSelection = activePageSnapshot.selection;
    const latestSelection = activeSelection && (!pendingSelection || activeSelection.ts >= pendingSelection.ts)
      ? activeSelection
      : pendingSelection;

    if (!latestSelection?.text) {
      return;
    }

    setSourceText(latestSelection.text);
    setSelectionContext(toSelectionContext(latestSelection));
    setModeOverride(null);
  }, [activePageSnapshot.selection?.ts, pendingSelection?.ts]);

  if (!hasAccess) {
    return (
      <AccessGate
        onSubmit={async code => {
          saveAccessCode(code);
          await activateRubiIdentity(code);
          setHasAccess(Boolean(getStoredAccessCode()));
        }}
      />
    );
  }

  const trimmedSource = sourceText.trim();
  const detectedMode = detectMode(trimmedSource);
  const activeMode = modeOverride ?? detectedMode;
  const pageContext = selectionContext ?? activePageSnapshot.context;
  const readingContext = {
    contextLabel: 'reading_reaction',
    contextTitle: pageContext?.title,
    contextUrl: pageContext?.url,
    contextExcerpt: pageContext ? trimmedSource || undefined : undefined,
  };
  const readingContextSentence = pageContext
    ? [
      pageContext.title ? `From ${pageContext.title}` : undefined,
      pageContext.url,
      trimmedSource,
    ].filter(Boolean).join(': ')
    : undefined;

  return (
    <main className="app-shell min-h-[100dvh] overflow-x-hidden p-4 text-slate-950">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="space-y-1">
          <p className="desk-kicker">Side panel</p>
          <h1 className="desk-title text-3xl">Idiomate</h1>
        </header>

        {pendingRequests > 0 ? (
          <p className="notice notice-success" role="status">
            {COLD_START_COPY}
          </p>
        ) : null}

        <section className="surface space-y-4" aria-label="selected text">
          <div className="space-y-2">
            <label className="field-label" htmlFor="idiomate-source-text">
              Selected or pasted text
            </label>
            <textarea
              id="idiomate-source-text"
              className="field min-h-28 resize-y"
              value={sourceText}
              onChange={event => {
                setSourceText(event.target.value);
                setSelectionContext(null);
                setModeOverride(null);
              }}
              placeholder="Highlight text on a webpage, or paste a word or sentence here."
            />
          </div>

          <div className="flex rounded-full border border-slate-200 bg-white p-1" aria-label="mode">
            {(['word', 'sentence', 'speak'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                  activeMode === mode
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
                aria-pressed={activeMode === mode}
                onClick={() => setModeOverride(mode)}
              >
                {mode === 'word' ? 'Word' : mode === 'sentence' ? 'Sentence' : 'Speak'}
              </button>
            ))}
          </div>

          {trimmedSource && activeMode !== 'speak' ? (
            <p className="text-xs leading-5 text-slate-500">
              Auto-detected as {detectedMode === 'word' ? 'word capture' : 'sentence lab'}.
            </p>
          ) : trimmedSource ? (
            <p className="text-xs leading-5 text-slate-500">
              Speak mode is ready for a spoken response.
            </p>
          ) : (
            <p className="text-xs leading-5 text-slate-500">
              No selection yet. The tool below is still ready for manual entry.
            </p>
          )}
        </section>

        <div>
          {activeMode === 'word' ? (
            <CaptureWord
              key={`word:${pageContext?.ts ?? 'manual'}:${trimmedSource}`}
              initialWord={trimmedSource}
              initialContextSentence={readingContextSentence}
              captureSource={pageContext ? 'website_reading' : undefined}
              captureSourceTitle={pageContext?.title}
              captureSourceUrl={pageContext?.url}
            />
          ) : activeMode === 'sentence' ? (
            <SentenceLab key={`sentence:${trimmedSource}`} initialSentence={trimmedSource} />
          ) : (
            <SpeakingReview
              key={`speak:${selectionContext?.ts ?? 'manual'}`}
              contextDefaults={readingContext}
            />
          )}
        </div>
      </div>
    </main>
  );
}
