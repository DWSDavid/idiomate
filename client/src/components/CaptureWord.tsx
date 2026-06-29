import React, { useState } from 'react';
import type { Vocab, VocabKind } from '../../../shared/types';
import { captureWord, getWordDeepDive, saveVocab, type WordDeepDiveResponse } from '../api';
import { WordIntelCard } from './WordIntelCard';

interface CaptureWordProps {
  onSaved?: (vocab: Vocab) => void;
  initialWord?: string;
  initialContextSentence?: string;
  captureSource?: string;
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

function dictionaryLinks(term: string): { merriamWebster: string; cambridge: string } {
  const encoded = encodeURIComponent(term.trim());
  return {
    merriamWebster: `https://www.merriam-webster.com/dictionary/${encoded}`,
    cambridge: `https://dictionary.cambridge.org/dictionary/english/${encoded}`,
  };
}

export function CaptureWord({ onSaved, initialWord, initialContextSentence, captureSource }: CaptureWordProps) {
  const [word, setWord] = useState(initialWord ?? '');
  const [contextSentence, setContextSentence] = useState(initialContextSentence ?? '');
  const [preview, setPreview] = useState<Vocab | null>(null);
  const [examplesText, setExamplesText] = useState('');
  const [collocationsText, setCollocationsText] = useState('');
  const [status, setStatus] = useState<'idle' | 'capturing' | 'saving' | 'saved' | 'error'>('idle');
  const [saveNote, setSaveNote] = useState('');
  const [intelCard, setIntelCard] = useState<(WordDeepDiveResponse & { word: string }) | null>(null);

  const handleCapture = async () => {
    if (!word.trim()) return;
    setStatus('capturing');
    setSaveNote('');
    setIntelCard(null);
    try {
      const enriched = await captureWord(word.trim(), contextSentence.trim());
      setPreview({
        ...enriched,
        source: captureSource ?? enriched.source,
        contextSentence: contextSentence.trim() || enriched.contextSentence,
      });
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
      void getWordDeepDive(saved.id)
        .then(data => setIntelCard({ ...data, word: savedVocab.word }))
        .catch(() => {});
    } catch {
      setStatus('error');
    }
  };

  const links = preview ? dictionaryLinks(preview.word) : null;

  return (
    <section className="surface" aria-label="quick capture">
      <span className="section-label">Add a word you met today</span>
      <div className="mt-4 grid gap-3">
        <label className="field-label">
          Word or phrase
          <input
            className="field mt-1"
            value={word}
            onChange={event => {
              setWord(event.target.value);
              setIntelCard(null);
            }}
          />
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
          {links ? (
            <div className="dictionary-strip md:col-span-2">
              <span className="text-xs font-semibold text-slate-500">Dictionary</span>
              <a href={links.merriamWebster} target="_blank" rel="noreferrer">Merriam-Webster</a>
              <a href={links.cambridge} target="_blank" rel="noreferrer">Cambridge</a>
            </div>
          ) : null}
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
            Part of speech
            <input className="field mt-1" value={preview.pos ?? ''} onChange={event => setPreview({ ...preview, pos: event.target.value })} placeholder="noun, verb, adj…" />
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
          {intelCard ? (
            <div className="md:col-span-2">
              <WordIntelCard
                word={intelCard.word}
                wordFamily={intelCard.wordFamily}
                usageExamplesRich={intelCard.usageExamplesRich}
                usageExamples={intelCard.usageExamples}
                nearSynonyms={intelCard.nearSynonyms}
                onDismiss={() => setIntelCard(null)}
              />
            </div>
          ) : null}
        </div>
      ) : status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Could not complete that.</p>
      ) : null}
    </section>
  );
}
