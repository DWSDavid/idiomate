import React, { useState } from 'react';
import type { SpeakingReviewResponse } from '../../../shared/types';
import { reviewSpeaking, type SpeakingReviewPayload } from '../api';

interface SpeakingReviewProps {
  onReviewed?: (result: SpeakingReviewResponse) => void;
  initialTranscript?: string;
  contextDefaults?: Omit<SpeakingReviewPayload, 'transcript' | 'context'>;
}

const reviewTypes = [
  { value: 'standalone_thought', label: 'Standalone thought' },
  { value: 'reading_reaction', label: 'Reading reaction' },
  { value: 'meeting_note', label: 'Meeting note' },
  { value: 'interview_answer', label: 'Interview answer' },
];

function errorTypeLabel(errorType: string): string {
  return errorType.replace(/_/g, ' ');
}

export function SpeakingReview({
  onReviewed,
  initialTranscript,
  contextDefaults,
}: SpeakingReviewProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? '');
  const [context, setContext] = useState('');
  const [contextLabel, setContextLabel] = useState(contextDefaults?.contextLabel ?? 'standalone_thought');
  const [result, setResult] = useState<SpeakingReviewResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'reviewing' | 'error'>('idle');

  const hasContextSource = Boolean(contextDefaults?.contextTitle || contextDefaults?.contextUrl);

  const runReview = () => {
    if (!transcript.trim()) return;

    setStatus('reviewing');
    setResult(null);
    void reviewSpeaking({
      transcript,
      context,
      contextLabel,
      contextTitle: contextDefaults?.contextTitle,
      contextUrl: contextDefaults?.contextUrl,
      contextExcerpt: contextDefaults?.contextExcerpt,
      date: contextDefaults?.date,
    })
      .then(next => {
        setResult(next);
        setStatus('idle');
        onReviewed?.(next);
      })
      .catch(() => setStatus('error'));
  };

  return (
    <section className="surface" aria-label="speaking review">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Speak</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Review spoken English from STT</h2>
        </div>
        <span className="chip">text only</span>
      </div>

      {hasContextSource ? (
        <div className="lab-panel mt-4">
          {contextDefaults?.contextTitle ? (
            <p className="text-sm font-semibold text-slate-950">{contextDefaults.contextTitle}</p>
          ) : null}
          {contextDefaults?.contextUrl ? (
            <a
              className="mt-1 block break-all text-sm font-medium text-indigo-700"
              href={contextDefaults.contextUrl}
              rel="noreferrer"
              target="_blank"
            >
              {contextDefaults.contextUrl}
            </a>
          ) : null}
          {contextDefaults?.contextExcerpt ? (
            <p className="mt-2 text-sm leading-6 text-slate-600">{contextDefaults.contextExcerpt}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <label className="field-label" htmlFor="speaking-review-transcript">
          Speech-to-text transcript
        </label>
        <textarea
          id="speaking-review-transcript"
          className="field min-h-28 resize-y"
          value={transcript}
          onChange={event => setTranscript(event.target.value)}
          placeholder="Paste the raw transcript from speech-to-text."
        />

        <label className="field-label" htmlFor="speaking-review-context">
          Context
        </label>
        <textarea
          id="speaking-review-context"
          className="field min-h-16 resize-y"
          value={context}
          onChange={event => setContext(event.target.value)}
          placeholder="Optional: what you were responding to or trying to say."
        />

        <label className="field-label" htmlFor="speaking-review-type">
          Review type
        </label>
        <select
          id="speaking-review-type"
          className="field"
          value={contextLabel}
          onChange={event => setContextLabel(event.target.value)}
        >
          {reviewTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!transcript.trim() || status === 'reviewing'}
          onClick={runReview}
        >
          {status === 'reviewing' ? 'Analyzing' : 'Analyze transcript'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Speaking review is unavailable right now.</p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="result-block">
            <p className="section-label">Native spoken version</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{result.nativeVersion}</p>
          </div>

          {result.takeaways.length ? (
            <div className="result-block">
              <p className="section-label">What to say differently next time</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
                {result.takeaways.map(takeaway => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.annotations.length ? (
            <div className="lab-panel">
              <p className="section-label">Expression notes</p>
              <div className="mt-3 space-y-3">
                {result.annotations.map((note, index) => (
                  <div key={`${note.errorType}-${note.span}-${index}`} className="result-block">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-slate-950">{note.span}</span>
                      <span className="chip">{errorTypeLabel(note.errorType)}</span>
                    </div>
                    {note.rule ? <p className="mt-2 text-sm font-semibold text-slate-900">{note.rule}</p> : null}
                    <p className="mt-2 text-sm leading-6 text-slate-600">{note.hint}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{note.explanation}</p>
                    {note.modelRewrite ? (
                      <p className="mt-2 text-sm leading-6 text-slate-700">{note.modelRewrite}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-600">This transcript sounds natural for the context.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
