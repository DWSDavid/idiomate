import React, { useState } from 'react';
import type { FollowUpMode, FollowUpScope } from '../../../shared/types';
import { askFollowUp, type FollowUpAnnotationPayload } from '../api';

interface FollowUpBoxProps {
  scope: FollowUpScope;
  mode: FollowUpMode;
  original: string;
  context?: string;
  rewrite?: string;
  nativeVersion?: string;
  annotations: FollowUpAnnotationPayload[];
}

function modeLabel(mode: FollowUpMode): string {
  return mode === 'pre_rewrite' ? 'Before your rewrite' : 'After your rewrite';
}

export function FollowUpBox({
  scope,
  mode,
  original,
  context,
  rewrite,
  nativeVersion,
  annotations,
}: FollowUpBoxProps) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'asking' | 'error'>('idle');

  const ask = async () => {
    if (!question.trim()) return;
    setStatus('asking');
    try {
      const response = await askFollowUp({
        scope,
        mode,
        question,
        original,
        context,
        rewrite,
        nativeVersion,
        annotations: annotations.map(annotation => ({
          ...annotation,
          span: annotation.span,
          errorType: annotation.errorType,
        })),
      });
      setAnswers(current => [...current, response.answer]);
      setQuestion('');
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="follow-up-box mt-4" aria-label={`${scope} follow-up`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Follow-up coach</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{modeLabel(mode)}</p>
        </div>
        {mode === 'pre_rewrite' ? <span className="chip chip-blue">hint only</span> : null}
      </div>

      <div className="mt-3 space-y-2">
        <label className="field-label" htmlFor={`${scope}-${mode}-follow-up`}>
          Follow-up question
        </label>
        <textarea
          id={`${scope}-${mode}-follow-up`}
          className="field min-h-20 resize-y"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder={mode === 'pre_rewrite'
            ? 'Ask about the pattern without revealing the answer yet.'
            : 'Ask why the native version or grammar move works.'}
        />
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={!question.trim() || status === 'asking'}
          onClick={() => void ask()}
        >
          {status === 'asking' ? 'Asking' : 'Ask follow-up'}
        </button>
      </div>

      {status === 'error' ? (
        <p className="mt-3 text-sm text-red-700">Follow-up coach is unavailable right now.</p>
      ) : null}

      {answers.length ? (
        <div className="mt-4 space-y-2">
          {answers.map((answer, index) => (
            <div key={`${answer}-${index}`} className="mini-brief text-sm leading-6 text-slate-700">
              {answer}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
