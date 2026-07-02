import React, { useState } from 'react';
import type { FlowLine, FlowDrillCheckResponse } from '../../../shared/types';
import { analyzeFlow, checkFlowDrill } from '../api';

interface FlowCoachProps {
  initialDraft?: string;
}

interface DrillState {
  attempt: string;
  status: 'idle' | 'checking' | 'done' | 'error';
  result: FlowDrillCheckResponse | null;
}

function emptyDrill(): DrillState {
  return { attempt: '', status: 'idle', result: null };
}

function FlowLineCard({ line, index }: { line: FlowLine; index: number }) {
  const [drill, setDrill] = useState<DrillState>(emptyDrill);

  const runCheck = async () => {
    if (!drill.attempt.trim()) return;
    setDrill(prev => ({ ...prev, status: 'checking' }));
    try {
      const result = await checkFlowDrill({
        drillPrompt: line.drill.prompt,
        targetSkill: line.drill.targetSkill,
        attempt: drill.attempt,
      });
      setDrill(prev => ({ ...prev, status: 'done', result }));
    } catch {
      setDrill(prev => ({ ...prev, status: 'error' }));
    }
  };

  return (
    <article className="surface space-y-3" aria-label={`sentence ${index + 1}`}>
      <p className="text-sm text-slate-500">
        <span className="chip chip-slate">Sentence {index + 1}</span>
      </p>

      <p className="text-sm leading-6 text-slate-500 line-through decoration-slate-300">{line.original}</p>

      {line.pieces.length ? (
        <div>
          <span className="field-label">Logical pieces</span>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
            {line.pieces.map((piece, i) => <li key={i}>{piece}</li>)}
          </ol>
        </div>
      ) : null}

      <div>
        <span className="field-label">Rewrite</span>
        <p className="mt-1 rounded-lg bg-emerald-50 p-3 text-base font-medium leading-6 text-slate-900">{line.rewrite}</p>
      </div>

      {line.linkToPrevious ? (
        <p className="text-sm leading-6">
          <span className="chip chip-blue">Link: {line.linkToPrevious.connective}</span>
          <span className="ml-2 text-slate-600">Why: {line.linkToPrevious.why}</span>
        </p>
      ) : null}

      {line.tenseNote ? (
        <p className="text-sm leading-6">
          <span className="chip">Tense: {line.tenseNote.tense}</span>
          <span className="ml-2 text-slate-600">Why: {line.tenseNote.why}</span>
        </p>
      ) : null}

      {line.changes.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {line.changes.map((change, i) => <li key={i}>{change}</li>)}
        </ul>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="field-label">🎯 Your turn</span>
          <span className="chip chip-slate">{line.drill.targetSkill}</span>
          {line.drill.vocabUsed.map(word => <span key={word} className="chip chip-emerald">{word}</span>)}
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-700">{line.drill.prompt}</p>
        <textarea
          className="field mt-2 min-h-16 resize-y"
          placeholder="Write your version here..."
          value={drill.attempt}
          onChange={event => setDrill(prev => ({ ...prev, attempt: event.target.value }))}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!drill.attempt.trim() || drill.status === 'checking'}
            onClick={runCheck}
          >
            {drill.status === 'checking' ? 'Checking' : 'Check my answer'}
          </button>
          {drill.status === 'error' ? <span className="text-sm text-red-700">Could not check that.</span> : null}
        </div>
        {drill.result ? (
          <div className="mt-3 space-y-2">
            <p className={`text-sm font-semibold ${drill.result.correct ? 'text-emerald-700' : 'text-amber-700'}`}>
              {drill.result.correct ? '✓ Nicely linked' : 'Close — see the fix'}
            </p>
            <p className="text-sm leading-6 text-slate-700">{drill.result.feedback}</p>
            <p className="text-sm leading-6">
              <span className="field-label">Model answer</span><br />
              <span className="text-slate-800">{drill.result.modelAnswer}</span>
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function FlowCoach({ initialDraft }: FlowCoachProps) {
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [context, setContext] = useState('');
  const [lines, setLines] = useState<FlowLine[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'error'>('idle');

  const runAnalyze = async () => {
    if (draft.trim().length < 12) return;
    setStatus('analyzing');
    try {
      const response = await analyzeFlow(draft, context);
      setLines(response.lines);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface space-y-3" aria-label="flow coach input">
        <span className="section-label">Flow Coach</span>
        <p className="text-sm leading-6 text-slate-600">
          Paste a few sentences. I'll coach each one against the one before it — the right connective and tense, how to
          split a run-on, and why — then drill you with your own vocabulary.
        </p>
        <label className="field-label">
          Your draft
          <textarea
            className="field mt-1 min-h-32 resize-y"
            placeholder="Paste two or more sentences of your writing here."
            value={draft}
            onChange={event => setDraft(event.target.value)}
          />
        </label>
        <label className="field-label">
          Context (optional)
          <input
            className="field mt-1"
            placeholder="e.g. an argument about AI in finance"
            value={context}
            onChange={event => setContext(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={draft.trim().length < 12 || status === 'analyzing'}
          onClick={runAnalyze}
        >
          {status === 'analyzing' ? 'Analyzing flow' : 'Analyze flow'}
        </button>
        {status === 'error' ? <p className="text-sm text-red-700">Could not analyze that. Try again.</p> : null}
      </section>

      {lines?.length ? (
        <div className="space-y-4">
          {lines.map((line, index) => (
            <FlowLineCard key={`${index}:${line.original}`} line={line} index={index} />
          ))}
        </div>
      ) : lines ? (
        <p className="text-sm text-slate-500">No sentences to coach yet.</p>
      ) : null}
    </div>
  );
}
