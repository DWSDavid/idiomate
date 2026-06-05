import React, { useState } from 'react';
import type { Annotation, ResearchResponse } from '../../../shared/types';
import { recordParagraph, researchEssay } from '../api';
import { CompareView, type ComparedAnnotation } from './CompareView';

type CoachPhase = 'review' | 'rewriting' | 'compared';

interface RecordContext {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
}

interface CoachPanelProps {
  paragraph: string;
  nativeVersion?: string;
  annotations: Annotation[];
  recordContext?: RecordContext;
  onRecorded?: () => void;
  onSubmit: (rewrite: string, accepted: ComparedAnnotation[]) => void;
}

export function CoachPanel({ paragraph, nativeVersion, annotations, recordContext, onRecorded, onSubmit }: CoachPanelProps) {
  const [phase, setPhase] = useState<CoachPhase>('review');
  const [rewrite, setRewrite] = useState(paragraph);
  const [accepted, setAccepted] = useState<ComparedAnnotation[]>([]);
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [researchError, setResearchError] = useState('');
  const [isResearching, setIsResearching] = useState(false);

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
    if (recordContext) {
      void recordParagraph({
        ...recordContext,
        paragraph,
        rewrite,
        annotations: compared.map(({ userRewrite: _userRewrite, ...annotation }) => annotation),
      }).then(onRecorded).catch(() => undefined);
    }
  };

  const runContentCheck = () => {
    setIsResearching(true);
    setResearchError('');
    void researchEssay(rewrite)
      .then(result => setResearch(result))
      .catch(() => setResearchError('Content check is unavailable right now.'))
      .finally(() => setIsResearching(false));
  };

  if (phase === 'compared') {
    return (
      <section className="surface" aria-label="coaching result">
        <CompareView original={paragraph} rewrite={rewrite} nativeVersion={nativeVersion} annotations={accepted} />
        <div className="mt-5 border-t border-stone-200 pt-4">
          <button type="button" className="btn-secondary" onClick={runContentCheck} disabled={isResearching}>
            {isResearching ? 'Checking content' : 'Content check'}
          </button>
          {researchError ? <p className="mt-3 text-sm text-red-700">{researchError}</p> : null}
          {research ? (
            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
              <p>{research.analysis}</p>
              {research.otherAngles.length ? (
                <div>
                  <div className="section-label">Other angles</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {research.otherAngles.map(angle => <li key={angle}>{angle}</li>)}
                  </ul>
                </div>
              ) : null}
              {research.sources.length ? (
                <div>
                  <div className="section-label">Sources</div>
                  <ul className="mt-2 space-y-2">
                    {research.sources.map(source => (
                      <li key={source.link}>
                        <a className="font-medium text-emerald-800 underline" href={source.link} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                        <span className="text-stone-500"> - {source.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <div className="section-label">Evidence-integrated essay</div>
                <p className="mt-2 whitespace-pre-wrap text-stone-900">{research.integratedEssay}</p>
              </div>
              {research.integrationNotes.length ? (
                <div>
                  <div className="section-label">Integration notes</div>
                  <ul className="mt-2 space-y-2">
                    {research.integrationNotes.map(note => (
                      <li key={`${note.insertedAfter}-${note.what}`}>
                        <span className="chip">{note.structurePart}</span>
                        <span className="ml-2">{note.what} {note.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
