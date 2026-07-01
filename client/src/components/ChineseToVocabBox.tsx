import React, { useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { saveChineseVocab } from '../api';

interface ChineseToVocabBoxProps {
  onSaved?: (vocab: Vocab) => void;
}

export function ChineseToVocabBox({ onSaved }: ChineseToVocabBoxProps) {
  const [text, setText] = useState('');
  const [contextSentence, setContextSentence] = useState('');
  const [saved, setSaved] = useState<Vocab | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const handleSave = async () => {
    if (!text.trim()) return;
    setStatus('saving');
    setSaveNote('');
    try {
      const response = await saveChineseVocab(text, contextSentence);
      const previous = response.previousCaptureCount ?? Math.max(0, response.captureCount - (response.captureDelta ?? 1));
      setSaved(response.vocab);
      setSaveNote(response.existed
        ? `Logged once more. Total seen: ${response.captureCount}${previous ? `, previously ${previous}` : ''}.`
        : 'Saved to your vocabulary.');
      setText('');
      setContextSentence('');
      onSaved?.(response.vocab);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="Chinese vocab capture">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-label">Chinese to English vocab</span>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Turn a Chinese idea you keep reaching for into an English word, phrase, or collocation.
          </p>
        </div>
        <span className="chip chip-blue">auto-save</span>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="field-label" htmlFor="chinese-vocab-input">
          Chinese expression
        </label>
        <textarea
          id="chinese-vocab-input"
          className="field min-h-20 resize-y"
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Type the Chinese idea you want to say naturally in English."
        />

        <label className="field-label" htmlFor="chinese-vocab-context">
          Intended use
        </label>
        <input
          id="chinese-vocab-context"
          className="field"
          value={contextSentence}
          onChange={event => setContextSentence(event.target.value)}
          placeholder="Optional: the sentence or topic where you want to use it."
        />

        <button
          type="button"
          className="btn-primary"
          disabled={!text.trim() || status === 'saving'}
          onClick={() => void handleSave()}
        >
          {status === 'saving' ? 'Adding' : 'Add English vocab'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Could not add that vocab item.</p>
      ) : null}

      {saved ? (
        <div className="result-block mt-4">
          <p className="font-semibold text-slate-950">Saved: {saved.word}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {saved.pos ? <span className="chip chip-slate">{saved.pos}</span> : null}
            {saved.kind ? <span className="chip">{saved.kind}</span> : null}
            <span className="chip chip-blue">seen {saved.captureCount ?? 1} total</span>
          </div>
          {saved.defCn ? <p className="mt-2 text-sm leading-6 text-slate-600">{saved.defCn}</p> : null}
          {saveNote ? <p className="mt-2 text-sm text-emerald-700">{saveNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
