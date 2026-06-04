import React, { useState } from 'react';
import type { Annotation } from '../../../shared/types';
import { CompareView, type ComparedAnnotation } from './CompareView';

type CoachPhase = 'review' | 'rewriting' | 'compared';

interface CoachPanelProps {
  paragraph: string;
  nativeVersion?: string;
  annotations: Annotation[];
  onSubmit: (rewrite: string, accepted: ComparedAnnotation[]) => void;
}

export function CoachPanel({ paragraph, nativeVersion, annotations, onSubmit }: CoachPanelProps) {
  const [phase, setPhase] = useState<CoachPhase>('review');
  const [rewrite, setRewrite] = useState(paragraph);
  const [accepted, setAccepted] = useState<ComparedAnnotation[]>([]);

  const submitRewrite = () => {
    const lower = rewrite.toLowerCase();
    const compared = annotations.map(annotation => ({
      ...annotation,
      userRewrite: rewrite,
      // A vocab suggestion counts as "used" only if the rewrite actually contains the word.
      accepted: annotation.errorType === 'vocab_suggestion'
        ? Boolean(annotation.vocabWord) && lower.includes((annotation.vocabWord ?? '').toLowerCase())
        : rewrite.trim().length > 0 && rewrite !== paragraph,
    }));
    setAccepted(compared);
    setPhase('compared');
    onSubmit(rewrite, compared);
  };

  if (phase === 'compared') {
    return (
      <section className="surface" aria-label="coaching result">
        <CompareView original={paragraph} rewrite={rewrite} nativeVersion={nativeVersion} annotations={accepted} />
      </section>
    );
  }

  return (
    <section className="surface" aria-label="coach notes">
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">Coach notes</span>
        {phase === 'review' ? (
          <button type="button" className="btn-primary" onClick={() => setPhase('rewriting')}>
            Try the rewrite
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {annotations.length ? (
          annotations.map(annotation => (
            <div key={`${annotation.errorType}-${annotation.span}`} className="border-l-2 border-stone-200 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-stone-900">{annotation.span}</span>
                <span className="chip">{annotation.errorType.replace(/_/g, ' ')}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-stone-600">{annotation.hint}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-500">No notes for this paragraph. Nicely done.</p>
        )}
      </div>

      {phase === 'rewriting' ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-stone-400">
            Rewrite the whole paragraph yourself first. The native version stays hidden until you submit.
          </p>
          <textarea
            className="prose min-h-32 w-full resize-y rounded-xl border border-stone-200 bg-stone-50/40 p-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            value={rewrite}
            onChange={event => setRewrite(event.target.value)}
          />
          <button type="button" className="btn-primary" onClick={submitRewrite}>
            Submit rewrite
          </button>
        </div>
      ) : null}
    </section>
  );
}
