import React, { useState } from 'react';
import type { Annotation, ResearchResponse, StructureResponse } from '../../../shared/types';
import { captureAndSaveVocab, recordParagraph, researchEssay, structureDraft } from '../api';
import { CompareView, type ComparedAnnotation } from './CompareView';
import { FollowUpBox } from './FollowUpBox';

type CoachPhase = 'review' | 'rewriting' | 'compared';
type StructureStatus = StructureResponse['observations'][number]['status'];

interface RecordContext {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
}

interface CoachPanelProps {
  paragraph: string;
  nativeVersion?: string;
  elevatedVersion?: string;
  elevationNotes?: string;
  annotations: Annotation[];
  recordContext?: RecordContext;
  onRecorded?: () => void;
  onSubmit: (rewrite: string, accepted: ComparedAnnotation[]) => void;
}

function statusClass(status: StructureStatus): string {
  return `status-chip status-${status}`;
}

type VocabSaveState = 'idle' | 'saving' | 'saved' | 'known';

function VocabSuggestCard({ annotation }: { annotation: Annotation }) {
  const [saveState, setSaveState] = useState<VocabSaveState>('idle');

  const handleSave = async () => {
    if (!annotation.vocabWord) return;
    setSaveState('saving');
    try {
      await captureAndSaveVocab(annotation.vocabWord, annotation.span);
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3 space-y-2">
      {annotation.distinction ? (
        <p className="text-sm leading-6 text-slate-700">{annotation.distinction}</p>
      ) : null}
      {annotation.vocabWord ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{annotation.vocabWord}</span>
          {saveState === 'idle' ? (
            <>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setSaveState('known')}
              >
                I know it
              </button>
              <button
                type="button"
                className="btn-primary text-xs py-1 px-3"
                onClick={() => void handleSave()}
              >
                New to me — save
              </button>
            </>
          ) : saveState === 'saving' ? (
            <span className="text-xs text-slate-400">Saving…</span>
          ) : saveState === 'saved' ? (
            <span className="text-xs text-emerald-600">✓ Saved to your words</span>
          ) : (
            <span className="text-xs text-slate-400">Got it</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CoachPanel({ paragraph, nativeVersion, elevatedVersion, elevationNotes, annotations, recordContext, onRecorded, onSubmit }: CoachPanelProps) {
  const [phase, setPhase] = useState<CoachPhase>('review');
  const [rewrite, setRewrite] = useState(paragraph);
  const [accepted, setAccepted] = useState<ComparedAnnotation[]>([]);
  const [compareTab, setCompareTab] = useState<'grammar' | 'elevated'>('grammar');
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [researchError, setResearchError] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [structure, setStructure] = useState<StructureResponse | null>(null);
  const [structureError, setStructureError] = useState('');
  const [isStructuring, setIsStructuring] = useState(false);

  const submitRewrite = () => {
    const lower = rewrite.toLowerCase();
    const compared = annotations.map(annotation => ({
      ...annotation,
      userRewrite: rewrite,
      // A vocab suggestion counts as "used" only if the rewrite actually contains the word.
      // For error annotations with a span, the issue is addressed when that span is gone.
      // Fallback: non-empty rewrite that differs from the original.
      accepted: annotation.errorType === 'vocab_suggestion'
        ? Boolean(annotation.vocabWord) && lower.includes((annotation.vocabWord ?? '').toLowerCase())
        : annotation.span
          ? !lower.includes(annotation.span.toLowerCase())
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
      .catch(() => setResearchError('Evidence check is unavailable right now.'))
      .finally(() => setIsResearching(false));
  };

  const runStructureCheck = () => {
    setIsStructuring(true);
    setStructureError('');
    void structureDraft(rewrite)
      .then(result => setStructure(result))
      .catch(() => setStructureError('Structure guidance is unavailable right now.'))
      .finally(() => setIsStructuring(false));
  };

  if (phase === 'compared') {
    const showTabs = Boolean(nativeVersion && elevatedVersion);
    return (
      <section className="surface" aria-label="coaching result">
        {showTabs ? (
          <div className="mb-4 flex gap-2 border-b border-stone-200">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${compareTab === 'grammar' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}
              onClick={() => setCompareTab('grammar')}
            >
              Grammar fix
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${compareTab === 'elevated' ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-stone-500 hover:text-stone-700'}`}
              onClick={() => setCompareTab('elevated')}
            >
              Elevated
            </button>
          </div>
        ) : null}
        {showTabs && compareTab === 'elevated' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <span className="section-label text-violet-700">Elevated version</span>
              <p className="prose mt-2 whitespace-pre-wrap text-lg text-stone-900">{elevatedVersion}</p>
              {elevationNotes ? (
                <p className="mt-3 text-sm text-violet-700">{elevationNotes}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <CompareView original={paragraph} rewrite={rewrite} nativeVersion={nativeVersion} annotations={accepted} />
        )}
        <FollowUpBox
          scope="paragraph"
          mode="post_rewrite"
          original={paragraph}
          rewrite={rewrite}
          nativeVersion={nativeVersion}
          annotations={accepted}
        />
        <div className="lab-panel mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-label">After-rewrite lab</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Check evidence, structure, and the source slots before you turn this into a final draft.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={runContentCheck} disabled={isResearching}>
                {isResearching ? 'Checking evidence' : 'Evidence check'}
              </button>
              <button type="button" className="btn-secondary" onClick={runStructureCheck} disabled={isStructuring}>
                {isStructuring ? 'Checking structure' : 'Structure check'}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="mini-brief">
              <p className="font-medium text-slate-900">Evidence mode</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Sources, other angles, and an integrated essay with where, what, and why notes.</p>
            </div>
            <div className="mini-brief">
              <p className="font-medium text-slate-900">Structure mode</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Topic sentence, claim, evidence, and commentary status for the draft.</p>
            </div>
          </div>
          {researchError ? <p className="mt-3 text-sm text-red-700">{researchError}</p> : null}
          {research ? (
            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
              <div className="result-block">
                <div className="section-label">Analysis</div>
                <p className="mt-2">{research.analysis}</p>
              </div>
              {research.otherAngles.length ? (
                <div className="result-block">
                  <div className="section-label">Other angles</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {research.otherAngles.map(angle => <li key={angle}>{angle}</li>)}
                  </ul>
                </div>
              ) : null}
              {research.sources.length ? (
                <div className="result-block">
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
              <div className="result-block result-block-strong">
                <div className="section-label">Evidence-integrated essay</div>
                <p className="mt-2 whitespace-pre-wrap text-stone-900">{research.integratedEssay}</p>
              </div>
              {research.integrationNotes.length ? (
                <div className="result-block">
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
          {structureError ? <p className="mt-3 text-sm text-red-700">{structureError}</p> : null}
          {structure ? (
            <div className="mt-4 grid gap-4 text-sm leading-6 text-slate-700 md:grid-cols-2">
              <div className="result-block">
                <div className="section-label">Ideal outline</div>
                <ol className="mt-2 list-decimal space-y-2 pl-5">
                  {structure.idealOutline.map(item => (
                    <li key={`${item.part}-${item.purpose}`}>
                      <span className="font-medium text-stone-900">{item.part}</span>
                      <span className="ml-2 text-stone-500">{item.purpose}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="result-block">
                <div className="section-label">Draft status</div>
                <ul className="mt-2 space-y-2">
                  {structure.observations.map(item => (
                    <li key={`${item.part}-${item.status}-${item.note}`}>
                      <span className={statusClass(item.status)}>{item.status}</span>
                      <span className="ml-2 font-medium text-stone-900">{item.part}</span>
                      <span className="ml-2 text-stone-500">{item.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
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
            <div key={`${annotation.errorType}-${annotation.span}`} className="coach-note-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-stone-900">{annotation.span}</span>
                <span className="chip">{annotation.errorType.replace(/_/g, ' ')}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="mini-brief">
                  <p className="section-label">What to change</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{annotation.hint}</p>
                </div>
                <div className="mini-brief">
                  <p className="section-label">Why it matters</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{annotation.explanation}</p>
                </div>
              </div>
              {annotation.rule ? (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                  <p className="section-label text-indigo-500">Try this pattern</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{annotation.rule}</p>
                </div>
              ) : null}
              {annotation.ruleExample ? (
                <div className="change-card mt-3">
                  <div>
                    <span className="change-label">From your text</span>
                    <p>{annotation.ruleExample.before}</p>
                  </div>
                  <div>
                    <span className="change-label">Change to</span>
                    <p className="font-semibold text-emerald-900">{annotation.ruleExample.after}</p>
                  </div>
                </div>
              ) : null}
              {annotation.errorType === 'vocab_suggestion' ? (
                <VocabSuggestCard annotation={annotation} />
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-500">No notes for this paragraph. Nicely done.</p>
        )}
      </div>

      {phase === 'review' ? (
        <FollowUpBox
          scope="paragraph"
          mode="pre_rewrite"
          original={paragraph}
          annotations={annotations}
        />
      ) : null}

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
