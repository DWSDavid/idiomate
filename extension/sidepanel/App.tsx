import React, { useEffect, useState } from 'react';
import { ACCESS_DENIED_EVENT, getStoredAccessCode, saveAccessCode } from '../../client/src/api';
import { AccessGate } from '../../client/src/components/AccessGate';
import { CaptureWord } from '../../client/src/components/CaptureWord';
import { SentenceLab } from '../../client/src/components/SentenceLab';
import { SpeakingReview } from '../../client/src/components/SpeakingReview';

type PendingSelection = {
  text: string;
  ts: number;
  title?: string;
  url?: string;
};

type Mode = 'word' | 'sentence' | 'speak';

const PENDING_SELECTION_KEY = 'idiomate_pending_selection';
const ACCESS_CODE_KEY = 'idiomate_access_code';
const COLD_START_COPY = 'Waking the server, ~20s on first request';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function isPendingSelection(value: unknown): value is PendingSelection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const selection = value as Partial<PendingSelection>;
  return typeof selection.text === 'string' && typeof selection.ts === 'number';
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

function detectMode(text: string): Mode {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'word';
  }

  return trimmed.split(/\s+/).length === 1 && trimmed.length <= 40 ? 'word' : 'sentence';
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
  const pendingRequests = usePendingRequests();
  const [hasAccess, setHasAccess] = useState(() => Boolean(getStoredAccessCode()));
  const [sourceText, setSourceText] = useState('');
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
    if (!pendingSelection?.text) {
      return;
    }

    setSourceText(pendingSelection.text);
    setModeOverride(null);
  }, [pendingSelection?.ts]);

  if (!hasAccess) {
    return (
      <AccessGate
        onSubmit={code => {
          saveAccessCode(code);
          setHasAccess(Boolean(getStoredAccessCode()));
        }}
      />
    );
  }

  const trimmedSource = sourceText.trim();
  const detectedMode = detectMode(trimmedSource);
  const activeMode = modeOverride ?? detectedMode;
  const readingContext = {
    contextLabel: 'reading_reaction',
    contextTitle: pendingSelection?.title,
    contextUrl: pendingSelection?.url,
    contextExcerpt: trimmedSource || undefined,
  };
  const readingContextSentence = [
    pendingSelection?.title ? `From ${pendingSelection.title}` : undefined,
    pendingSelection?.url,
    trimmedSource,
  ].filter(Boolean).join(': ');

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

          {trimmedSource ? (
            <p className="text-xs leading-5 text-slate-500">
              Auto-detected as {detectedMode === 'word' ? 'word capture' : 'sentence lab'}.
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
              key={`word:${trimmedSource}`}
              initialWord={trimmedSource}
              initialContextSentence={readingContextSentence}
              captureSource="website_reading"
            />
          ) : activeMode === 'sentence' ? (
            <SentenceLab key={`sentence:${trimmedSource}`} initialSentence={trimmedSource} />
          ) : (
            <SpeakingReview
              key={`speak:${pendingSelection?.ts ?? 'manual'}`}
              contextDefaults={readingContext}
            />
          )}
        </div>
      </div>
    </main>
  );
}
