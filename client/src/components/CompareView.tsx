import React from 'react';
import type { Annotation } from '../../../shared/types';

export interface ComparedAnnotation extends Annotation {
  accepted?: boolean;
  userRewrite?: string;
}

interface CompareViewProps {
  original: string;
  rewrite: string;
  annotations: ComparedAnnotation[];
}

export function CompareView({ original, rewrite, annotations }: CompareViewProps) {
  return (
    <section className="space-y-5" aria-label="rewrite comparison">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-700">Original</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">{original}</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-800">Your Rewrite</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">{rewrite}</p>
        </div>
      </div>

      <div className="space-y-3">
        {annotations.map(annotation => (
          <article key={`${annotation.errorType}-${annotation.span}`} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-900">{annotation.span}</span>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {annotation.errorType}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">{annotation.explanation}</p>
            <p className="mt-2 text-sm font-medium text-emerald-800">{annotation.modelRewrite}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
