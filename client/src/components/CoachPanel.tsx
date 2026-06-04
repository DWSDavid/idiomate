import React, { useState } from 'react';
import type { Annotation } from '../../../shared/types';
import { CompareView, type ComparedAnnotation } from './CompareView';

type CoachPhase = 'review' | 'rewriting' | 'compared';

interface CoachPanelProps {
  paragraph: string;
  annotations: Annotation[];
  onSubmit: (rewrite: string, accepted: ComparedAnnotation[]) => void;
}

export function CoachPanel({ paragraph, annotations, onSubmit }: CoachPanelProps) {
  const [phase, setPhase] = useState<CoachPhase>('review');
  const [rewrite, setRewrite] = useState(paragraph);
  const [accepted, setAccepted] = useState<ComparedAnnotation[]>([]);

  const submitRewrite = () => {
    const compared = annotations.map(annotation => ({
      ...annotation,
      userRewrite: rewrite,
      accepted: rewrite.trim().length > 0 && rewrite !== paragraph,
    }));
    setAccepted(compared);
    setPhase('compared');
    onSubmit(rewrite, compared);
  };

  if (phase === 'compared') {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <CompareView original={paragraph} rewrite={rewrite} annotations={accepted} />
      </div>
    );
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4" aria-label="coach notes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Coach Notes</h2>
        {phase === 'review' ? (
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            onClick={() => setPhase('rewriting')}
          >
            Rewrite
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {annotations.length ? annotations.map(annotation => (
          <article key={`${annotation.errorType}-${annotation.span}`} className="rounded-md border border-zinc-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-900">{annotation.span}</span>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {annotation.errorType}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{annotation.hint}</p>
          </article>
        )) : (
          <p className="text-sm text-zinc-600">No notes for this paragraph.</p>
        )}
      </div>

      {phase === 'rewriting' ? (
        <div className="mt-4 space-y-3">
          <textarea
            className="min-h-32 w-full rounded-md border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            value={rewrite}
            onChange={event => setRewrite(event.target.value)}
          />
          <button
            type="button"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={submitRewrite}
          >
            Submit Rewrite
          </button>
        </div>
      ) : null}
    </section>
  );
}
