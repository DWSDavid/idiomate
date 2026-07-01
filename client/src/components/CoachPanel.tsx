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

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function EvidenceBodyParagraph({ research }: { research: ResearchResponse }) {
  const sentences = splitSentences(research.integratedEssay);
  const topicSentence = sentences[0] ?? research.integratedEssay;
  const synthesis = sentences.length > 1 ? sentences[sentences.length - 1] : research.analysis;
  const notesFor = (part: string) => research.integrationNotes.filter(note => note.structurePart === part);
  const evidenceNotes = notesFor('evidence');
  const commentaryNotes = notesFor('commentary');

  return (
    <div className="result-block result-block-strong">
      <div className="section-label">Highlighted body paragraph</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="mini-brief">
          <p className="section-label">Topic sentence</p>
          <p className="mt-2 text-sm leading-6 text-slate-800">{topicSentence}</p>
        </div>
        <div className="mini-brief">
          <p className="section-label">Evidence</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {(evidenceNotes.length ? evidenceNotes : research.sources.slice(0, 2).map(source => ({
              insertedAfter: source.title,
              what: source.summary,
              why: 'Use this source as a concrete evidence slot.',
              structurePart: 'evidence' as const,
            }))).map(note => (
              <li key={`${note.insertedAfter}-${note.what}`}>
                <strong>{note.what}</strong>
                <span className="text-slate-500"> {note.why}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mini-brief">
          <p className="section-label">Commentary</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {(commentaryNotes.length ? commentaryNotes : research.integrationNotes.slice(0, 2)).map(note => (
              <li key={`${note.insertedAfter}-${note.why}`}>{note.why}</li>
            ))}
          </ul>
        </div>
        <div className="mini-brief">
          <p className="section-label">Source communication + synthesis</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {research.otherAngles[0] ? `${research.otherAngles[0]} ` : ''}
            {synthesis}
          </p>
        </div>
      </div>
      {research.sources.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {research.sources.map(source => (
            <a key={source.link} className="chip chip-blue" href={source.link} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function chineseMindsetNote(annotation: Annotation): string {
  const text = `${annotation.rule ?? ''} ${annotation.explanation} ${annotation.hint} ${annotation.distinction ?? ''}`.toLowerCase();
  const explanationText = `${annotation.rule ?? ''} ${annotation.explanation} ${annotation.distinction ?? ''}`.toLowerCase();
  if (annotation.errorType === 'tense' || /ongoing|finished|present perfect|has done|is doing|has been|revolutionizing/.test(text)) {
    return '中文常靠上下文表示时间线；英语需要把过程状态说出来。Use present perfect for a result that exists now, and present progressive for an ongoing process, such as "AI has changed hiring" vs. "AI is revolutionizing hiring."';
  }
  if (annotation.errorType === 'modality' || /\bcould\b|\bcan\b|\bwould\b|\bwill\b/.test(explanationText)) {
    return '中文的“可以/会”常很宽；英语会区分 certainty and distance. "Can/will" sounds direct and likely; "could/would" creates possibility, caution, or a conditional frame.';
  }
  if (annotation.errorType === 'vocab_suggestion') {
    return '中文写作容易先选一个泛词或直译词块；英语更偏向用 precise verb + natural collocation, so the reader knows the action, register, and relationship at once.';
  }
  if (annotation.errorType === 'calque' || annotation.errorType === 'word_choice') {
    return '中文表达可以先给概念再补语境；英语句子更常直接选择一个搭配好的词组，让 meaning and usage move together.';
  }
  return '中文可以靠语境补全关系；英语更依赖 form: tense, preposition, article, and collocation need to carry part of the meaning.';
}

function formDetail(annotation: Annotation): string {
  const target = annotation.vocabWord ?? annotation.modelRewrite ?? annotation.ruleExample?.after ?? '';
  const lower = `${target} ${annotation.rule ?? ''} ${annotation.explanation}`.toLowerCase();
  if (/\bworth\b/.test(lower) && /\bing\b/.test(lower)) {
    return 'Fixed combo: worth + v-ing. Keep the gerund because "worth" evaluates the action itself.';
  }
  if (/\bdesign(ed|ing)? for\b/.test(lower)) {
    return 'Fixed combo: design for + audience/purpose. The preposition "for" names who or what the design serves.';
  }
  if (/\bdecision on\b|\bdecide on\b/.test(lower)) {
    return 'Fixed combo: make a decision on / decide on + issue. "On" points to the matter being settled.';
  }
  if (/\bcould\b|\bcan\b/.test(lower)) {
    return 'Modal detail: can = real ability/permission; could = possible, softer, or conditional.';
  }
  if (/\bwould\b|\bwill\b/.test(lower)) {
    return 'Modal detail: will = expected future/result; would = conditional, hypothetical, or more cautious.';
  }
  if ((target.trim().split(/\s+/).length > 1) || annotation.errorType === 'vocab_suggestion') {
    return 'Chunk detail: save and reuse the whole expression, including its preposition or noun pattern, instead of memorizing only the head word.';
  }
  return 'Form detail: notice the exact tense, preposition, and word form because small form choices often carry the real meaning.';
}

function AnnotationInsight({ annotation }: { annotation: Annotation }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
      <p className="section-label text-amber-800">Rule + Chinese-L1 mindset</p>
      <div className="mt-2 grid gap-2 text-sm leading-6 text-slate-700 md:grid-cols-2">
        <p><strong>Rule:</strong> {annotation.rule ?? annotation.hint}</p>
        <p><strong>中文提醒:</strong> {chineseMindsetNote(annotation)}</p>
        <p className="md:col-span-2"><strong>Form detail:</strong> {formDetail(annotation)}</p>
      </div>
    </div>
  );
}

function VocabSuggestCard({ annotation }: { annotation: Annotation }) {
  const [saveState, setSaveState] = useState<VocabSaveState>('idle');
  const [savedWord, setSavedWord] = useState('');

  const handleSave = async () => {
    if (!annotation.vocabWord) return;
    setSaveState('saving');
    try {
      const saved = await captureAndSaveVocab(annotation.vocabWord, annotation.span);
      setSavedWord(saved.canonicalWord ?? saved.vocab?.word ?? annotation.vocabWord);
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="section-label text-violet-800">Recommended expression</span>
        {annotation.vocabWord && annotation.vocabWord.trim().split(/\s+/).length > 1 ? (
          <span className="chip">chunk / fixed combo</span>
        ) : null}
      </div>
      {annotation.distinction ? (
        <p className="text-sm leading-6 text-slate-700">
          <strong>Why this word works:</strong> {annotation.distinction}
        </p>
      ) : null}
      <div className="rounded-lg bg-white/75 p-2 text-sm leading-6 text-slate-700">
        <span className="font-medium text-slate-900">Context move:</span>{' '}
        replace <mark className="rounded bg-rose-100 px-1 text-rose-900">{annotation.span}</mark>{' '}
        with <mark className="rounded bg-emerald-100 px-1 text-emerald-900">{annotation.vocabWord ?? annotation.modelRewrite}</mark>
        .
      </div>
      <p className="text-sm leading-6 text-slate-700">
        <strong>中文提醒:</strong> {chineseMindsetNote(annotation)}
      </p>
      <p className="text-sm leading-6 text-slate-700">
        <strong>Pattern detail:</strong> {formDetail(annotation)}
      </p>
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
            <span className="text-xs text-emerald-600">✓ Saved to your words{savedWord ? ` as ${savedWord}` : ''}</span>
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
        nativeText: nativeVersion,
        elevatedText: elevatedVersion,
        annotations: compared.map(({ userRewrite: _userRewrite, ...annotation }) => annotation),
      }).then(onRecorded).catch(() => undefined);
    }
  };

  const runContentCheck = () => {
    setIsResearching(true);
    setResearchError('');
    void researchEssay(rewrite)
      .then(result => {
        setResearch(result);
        if (recordContext) {
          void recordParagraph({
            ...recordContext,
            paragraph,
            rewrite,
            nativeText: nativeVersion,
            elevatedText: elevatedVersion,
            evidenceText: result.integratedEssay,
            annotations: accepted.map(({ userRewrite: _userRewrite, ...annotation }) => annotation),
          }).then(onRecorded).catch(() => undefined);
        }
      })
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
              <EvidenceBodyParagraph research={research} />
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
              <AnnotationInsight annotation={annotation} />
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
