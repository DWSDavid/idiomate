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
  const [saveNote, setSaveNote] = useState('');

  const handleCapture = async () => {
    if (!word.trim()) return;
    setStatus('capturing');
    setSaveNote('');
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
    setSaveNote('');
    try {
      const saved = await saveVocab(next);
      const savedVocab = { ...next, id: saved.id, captureCount: saved.captureCount };
      setPreview(savedVocab);
      if (saved.existed) {
        setSaveNote(`Already in your list - met ${saved.captureCount} times, priority raised.`);
      }
      onSaved?.(savedVocab);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="quick capture">
      <span className="section-label">Add a word you met today</span>
      <div className="mt-4 grid gap-3">
        <label className="field-label">
          Word or phrase
          <input className="field mt-1" value={word} onChange={event => setWord(event.target.value)} />
        </label>
        <label className="field-label">
          Where you saw it (optional)
          <input
            className="field mt-1"
            placeholder="e.g. an FT headline"
            value={contextSentence}
            onChange={event => setContextSentence(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!word.trim() || status === 'capturing'}
          onClick={handleCapture}
        >
          {status === 'capturing' ? 'Enriching' : 'Enrich'}
        </button>
      </div>

      {preview ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="field-label">
            Headword
            <input className="field mt-1" value={preview.word} onChange={event => setPreview({ ...preview, word: event.target.value })} />
          </label>
          <label className="field-label">
            Kind
            <select
              className="field mt-1"
              value={preview.kind ?? 'word'}
              onChange={event => setPreview({ ...preview, kind: event.target.value as VocabKind })}
            >
              <option value="word">word</option>
              <option value="phrase">phrase</option>
              <option value="collocation">collocation</option>
            </select>
          </label>
          <label className="field-label">
            IPA
            <input className="field mt-1" value={preview.ipa ?? ''} onChange={event => setPreview({ ...preview, ipa: event.target.value })} />
          </label>
          <label className="field-label">
            Register
            <input className="field mt-1" value={preview.register ?? ''} onChange={event => setPreview({ ...preview, register: event.target.value })} />
          </label>
          <label className="field-label md:col-span-2">
            Definition
            <input className="field mt-1" value={preview.defCn ?? ''} onChange={event => setPreview({ ...preview, defCn: event.target.value })} />
          </label>
          <label className="field-label">
            Examples
            <textarea className="field mt-1 min-h-24" value={examplesText} onChange={event => setExamplesText(event.target.value)} />
          </label>
          <label className="field-label">
            Collocations
            <textarea className="field mt-1 min-h-24" value={collocationsText} onChange={event => setCollocationsText(event.target.value)} />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <button type="button" className="btn-primary" disabled={status === 'saving'} onClick={handleSave}>
              {status === 'saving' ? 'Saving' : 'Save to my words'}
            </button>
            {saveNote ? (
              <span className="text-sm text-emerald-700">{saveNote}</span>
            ) : status === 'saved' ? (
              <span className="text-sm text-emerald-700">Saved.</span>
            ) : null}
            {status === 'error' ? <span className="text-sm text-red-700">Could not complete that.</span> : null}
          </div>
        </div>
      ) : status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Could not complete that.</p>
      ) : null}
    </section>
  );
}
