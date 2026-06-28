import React, { useState } from 'react';
import type { SentenceLabDiagnosisResponse, SentenceLabResultResponse } from '../../../shared/types';
import { diagnoseSentenceLab, revealSentenceLabResult } from '../api';
import { CompareView } from './CompareView';
import { FollowUpBox } from './FollowUpBox';

interface SentenceLabProps {
  onRecorded?: () => void;
  initialSentence?: string;
}

export function SentenceLab({ onRecorded, initialSentence }: SentenceLabProps) {
  const [sentence, setSentence] = useState(initialSentence ?? '');
  const [context, setContext] = useState('');
  const [rewrite, setRewrite] = useState('');
  const [diagnosis, setDiagnosis] = useState<SentenceLabDiagnosisResponse | null>(null);
  const [result, setResult] = useState<SentenceLabResultResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'revealing' | 'error'>('idle');

  const runDiagnosis = () => {
    if (!sentence.trim()) return;
    setStatus('checking');
    setResult(null);
    void diagnoseSentenceLab(sentence, context)
      .then(next => {
        setDiagnosis(next);
        setRewrite(sentence);
        setStatus('idle');
        onRecorded?.();
      })
      .catch(() => setStatus('error'));
  };

  const reveal = () => {
    if (!diagnosis || !rewrite.trim()) return;
    setStatus('revealing');
    void revealSentenceLabResult(diagnosis.id, rewrite)
      .then(next => {
        setResult(next);
        setStatus('idle');
        onRecorded?.();
      })
      .catch(() => setStatus('error'));
  };

  return (
    <section className="surface" aria-label="Sentence Lab">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Sentence Lab</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Does this sound natural?</h2>
        </div>
        <span className="chip chip-blue">quick check</span>
      </div>

      <div className="mt-4 space-y-3">
        <label className="field-label" htmlFor="sentence-lab-input">Sentence to check</label>
        <textarea
          id="sentence-lab-input"
          className="field min-h-24 resize-y"
          value={sentence}
          onChange={event => setSentence(event.target.value)}
          placeholder="Paste the sentence that feels slightly off."
        />

        <label className="field-label" htmlFor="sentence-lab-context">Context</label>
        <textarea
          id="sentence-lab-context"
          className="field min-h-16 resize-y"
          value={context}
          onChange={event => setContext(event.target.value)}
          placeholder="Optional: who you are saying this to, and why."
        />

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!sentence.trim() || status === 'checking'}
          onClick={runDiagnosis}
        >
          {status === 'checking' ? 'Checking' : 'Check sentence'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Sentence Lab is unavailable right now.</p>
      ) : null}

      {diagnosis && !result ? (
        <div className="mt-5 space-y-4">
          <div className="lab-panel">
            <p className="section-label">Diagnosis first</p>
            <div className="mt-3 space-y-3">
              {diagnosis.notes.length ? diagnosis.notes.map(note => (
                <div key={`${note.errorType}-${note.span}`} className="result-block">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-slate-950">{note.span}</span>
                    <span className="chip">{note.errorType.replace(/_/g, ' ')}</span>
                  </div>
                  {note.rule ? <p className="mt-2 text-sm font-semibold text-slate-900">{note.rule}</p> : null}
                  <p className="mt-2 text-sm leading-6 text-slate-600">{note.hint}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{note.explanation}</p>
                  {note.bookReference ? (
                    <div className="mt-3 rounded-xl border border-indigo-100 bg-white/75 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-semibold text-indigo-700">{note.bookReference.source}</p>
                      <p className="mt-1">{note.bookReference.pattern}</p>
                      {note.bookReference.quote ? (
                        <p className="mt-1 text-slate-500">"{note.bookReference.quote}"</p>
                      ) : (
                        <p className="mt-1 text-slate-400">{note.bookReference.quoteStatus}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )) : (
                <p className="text-sm leading-6 text-slate-600">This sentence looks natural for the context. You can still try a tighter rewrite.</p>
              )}
            </div>
          </div>

          <FollowUpBox
            scope="sentence_lab"
            mode="pre_rewrite"
            original={diagnosis.sentence}
            context={diagnosis.context}
            annotations={diagnosis.notes}
          />

          <div>
            <label className="field-label" htmlFor="sentence-lab-rewrite">Your rewrite</label>
            <textarea
              id="sentence-lab-rewrite"
              className="field mt-2 min-h-24 resize-y"
              value={rewrite}
              onChange={event => setRewrite(event.target.value)}
            />
            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              disabled={!rewrite.trim() || status === 'revealing'}
              onClick={reveal}
            >
              {status === 'revealing' ? 'Revealing' : 'Reveal after my rewrite'}
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-5">
          <CompareView
            original={result.sentence}
            rewrite={result.rewrite}
            nativeVersion={result.nativeVersion}
            annotations={result.annotations}
          />
          <FollowUpBox
            scope="sentence_lab"
            mode="post_rewrite"
            original={result.sentence}
            context={result.context}
            rewrite={result.rewrite}
            nativeVersion={result.nativeVersion}
            annotations={result.annotations}
          />
        </div>
      ) : null}
    </section>
  );
}
