import React, { useState } from 'react';
import type { Vocab, VocabKind } from '../../../shared/types';
import { captureWord, saveVocab } from '../api';

interface CaptureWordProps {
  onSaved?: (vocab: Vocab) => void;
}

function toLines(items?: string[]): string {
  return (items ?? []).join('\n');
}

function fromLines(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export function CaptureWord({ onSaved }: CaptureWordProps) {
  const [word, setWord] = useState('');
  const [contextSentence, setContextSentence] = useState('');
  const [preview, setPreview] = useState<Vocab | null>(null);
  const [examplesText, setExamplesText] = useState('');
  const [collocationsText, setCollocationsText] = useState('');
  const [status, setStatus] = useState<'idle' | 'capturing' | 'saving' | 'saved' | 'error'>('idle');

  const handleCapture = async () => {
    if (!word.trim()) return;
    setStatus('capturing');
    try {
      const enriched = await captureWord(word.trim(), contextSentence.trim());
      setPreview(enriched);
      setExamplesText(toLines(enriched.examples));
      setCollocationsText(toLines(enriched.collocations));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    const next: Vocab = {
      ...preview,
      examples: fromLines(examplesText),
      collocations: fromLines(collocationsText),
    };
    setStatus('saving');
    try {
      await saveVocab(next);
      setPreview(next);
      onSaved?.(next);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-label="quick capture">
      <div className="grid gap-3 md:grid-cols-[minmax(10rem,14rem)_1fr_auto]">
        <label className="text-sm font-medium text-zinc-700">
          Word
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            value={word}
            onChange={event => setWord(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Context sentence
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            value={contextSentence}
            onChange={event => setContextSentence(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="self-end rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={!word.trim() || status === 'capturing'}
          onClick={handleCapture}
        >
          {status === 'capturing' ? 'Capturing...' : 'Capture'}
        </button>
      </div>

      {preview ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700">
            Headword
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={preview.word}
              onChange={event => setPreview({ ...preview, word: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Kind
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={preview.kind ?? 'word'}
              onChange={event => setPreview({ ...preview, kind: event.target.value as VocabKind })}
            >
              <option value="word">word</option>
              <option value="phrase">phrase</option>
              <option value="collocation">collocation</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            IPA
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={preview.ipa ?? ''}
              onChange={event => setPreview({ ...preview, ipa: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Register
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={preview.register ?? ''}
              onChange={event => setPreview({ ...preview, register: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700 md:col-span-2">
            Definition
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={preview.defCn ?? ''}
              onChange={event => setPreview({ ...preview, defCn: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Examples
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={examplesText}
              onChange={event => setExamplesText(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Collocations
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={collocationsText}
              onChange={event => setCollocationsText(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={status === 'saving'}
              onClick={handleSave}
            >
              {status === 'saving' ? 'Saving...' : 'Save'}
            </button>
            {status === 'saved' ? <span className="text-sm text-emerald-700">Saved.</span> : null}
            {status === 'error' ? <span className="text-sm text-red-700">Could not complete request.</span> : null}
          </div>
        </div>
      ) : status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Could not complete request.</p>
      ) : null}
    </section>
  );
}
