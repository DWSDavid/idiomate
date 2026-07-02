import React, { useEffect, useMemo, useState } from 'react';
import type { Pattern, PatternUsageCheckResponse } from '../../../shared/types';
import { buildPatternCue, detectPreposition } from '../../../shared/types';
import { addPattern, checkPatternUsage, deletePattern, getPatterns, reviewPattern } from '../api';

type Mode = 'browse' | 'drill';

function speak(text: string) {
  if (!('speechSynthesis' in globalThis) || !('SpeechSynthesisUtterance' in globalThis)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  globalThis.speechSynthesis.cancel();
  globalThis.speechSynthesis.speak(utterance);
}

function AddPatternBox({ onAdded }: { onAdded: (pattern: Pattern) => void }) {
  const [phrase, setPhrase] = useState('');
  const [preposition, setPreposition] = useState('');
  const [example, setExample] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  // Auto-fill the gap word as the user types, but let them override tricky ones.
  const detected = useMemo(() => detectPreposition(phrase), [phrase]);
  const activePreposition = preposition.trim() || detected;
  const cuePreview = phrase.trim() ? buildPatternCue(phrase.trim(), activePreposition) : '';

  const submit = async () => {
    if (!phrase.trim()) return;
    setStatus('saving');
    setError('');
    try {
      const pattern = await addPattern({
        phrase: phrase.trim(),
        preposition: activePreposition || undefined,
        example: example.trim() || undefined,
      });
      onAdded(pattern);
      setPhrase('');
      setPreposition('');
      setExample('');
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that pattern.');
      setStatus('error');
    }
  };

  return (
    <section className="surface space-y-3" aria-label="add pattern">
      <span className="section-label">Add a fixed pattern</span>
      <p className="text-sm leading-6 text-slate-600">
        Paste a fixed prepositional phrase (e.g. <em>on the stage</em>, <em>at an event</em>, <em>play with</em>). I'll blank
        out the preposition so you can drill it.
      </p>
      <label className="field-label">
        Phrase
        <input
          className="field mt-1"
          placeholder="on the stage"
          value={phrase}
          onChange={event => setPhrase(event.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Preposition (the gap)
          <input
            className="field mt-1"
            placeholder={detected || 'auto-detected'}
            value={preposition}
            onChange={event => setPreposition(event.target.value)}
          />
        </label>
        <label className="field-label">
          Example (optional)
          <input
            className="field mt-1"
            placeholder="The actor stood on the stage."
            value={example}
            onChange={event => setExample(event.target.value)}
          />
        </label>
      </div>
      {cuePreview ? (
        <p className="text-sm text-slate-500">Drill preview: <span className="font-semibold text-slate-800">{cuePreview}</span> → <span className="font-semibold text-emerald-700">{activePreposition || '?'}</span></p>
      ) : null}
      <button type="button" className="btn-primary" disabled={!phrase.trim() || status === 'saving'} onClick={submit}>
        {status === 'saving' ? 'Saving' : 'Save pattern'}
      </button>
      {status === 'error' ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}

function accuracy(pattern: Pattern): string {
  if (!pattern.timesSeen) return 'not drilled yet';
  return `${pattern.timesCorrect}/${pattern.timesSeen} correct`;
}

function BrowseList({ patterns, onDelete }: { patterns: Pattern[]; onDelete: (id: number) => void }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const groups = useMemo(() => {
    const map = new Map<string, Pattern[]>();
    for (const pattern of patterns) {
      map.set(pattern.preposition, [...(map.get(pattern.preposition) ?? []), pattern]);
    }
    return Array.from(map.entries());
  }, [patterns]);

  if (!patterns.length) {
    return <p className="text-sm text-slate-500">No patterns yet. Add your first fixed phrase above.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map(([preposition, items]) => (
        <section key={preposition} className="surface space-y-2" aria-label={`patterns with ${preposition}`}>
          <div className="flex items-center gap-2">
            <span className="chip chip-blue">{preposition}</span>
            <span className="text-xs text-slate-500">{items.length} {items.length === 1 ? 'pattern' : 'patterns'}</span>
          </div>
          <ul className="space-y-1.5">
            {items.map(pattern => (
              <li key={pattern.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
                <button
                  type="button"
                  className="text-left text-sm"
                  onClick={() => setRevealed(prev => {
                    const next = new Set(prev);
                    next.has(pattern.id) ? next.delete(pattern.id) : next.add(pattern.id);
                    return next;
                  })}
                  title="Tap to reveal / hide the answer"
                >
                  <span className="font-medium text-slate-800">
                    {revealed.has(pattern.id) ? pattern.phrase : pattern.cue}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{accuracy(pattern)}</span>
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" className="vocab-action" onClick={() => speak(pattern.phrase)} aria-label={`Hear ${pattern.phrase}`}>Hear</button>
                  <button type="button" className="text-xs text-slate-400 hover:text-red-600" onClick={() => onDelete(pattern.id)} aria-label={`Delete ${pattern.phrase}`}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FillDrill({ patterns, onReviewed }: { patterns: Pattern[]; onReviewed: (pattern: Pattern) => void }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<null | boolean>(null);
  const [usage, setUsage] = useState('');
  const [usageResult, setUsageResult] = useState<PatternUsageCheckResponse | null>(null);
  const [usageStatus, setUsageStatus] = useState<'idle' | 'checking' | 'error'>('idle');

  const pattern = patterns[index];

  const reset = () => {
    setAnswer('');
    setChecked(null);
    setUsage('');
    setUsageResult(null);
    setUsageStatus('idle');
  };

  const submit = async () => {
    if (!pattern || checked !== null) return;
    const correct = answer.trim().toLowerCase() === pattern.preposition.toLowerCase();
    setChecked(correct);
    try {
      const updated = await reviewPattern(pattern.id, correct);
      onReviewed(updated);
    } catch {
      // Recall tracking is best-effort; the drill still works if the write fails.
    }
  };

  const next = () => {
    reset();
    setIndex(current => (current + 1) % Math.max(1, patterns.length));
  };

  const runUsageCheck = async () => {
    if (!pattern || !usage.trim()) return;
    setUsageStatus('checking');
    try {
      const result = await checkPatternUsage({ phrase: pattern.phrase, preposition: pattern.preposition, sentence: usage });
      setUsageResult(result);
      setUsageStatus('idle');
    } catch {
      setUsageStatus('error');
    }
  };

  if (!patterns.length) {
    return <p className="text-sm text-slate-500">Add some patterns first, then come back to drill them.</p>;
  }
  if (!pattern) return null;

  return (
    <section className="surface space-y-4" aria-label="fill the preposition drill">
      <div className="flex items-center justify-between">
        <span className="section-label">Fill the preposition</span>
        <span className="text-xs text-slate-400">{index + 1} / {patterns.length}</span>
      </div>

      <p className="text-xl font-semibold text-slate-900">{pattern.cue}</p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="field max-w-40"
          placeholder="preposition"
          value={answer}
          disabled={checked !== null}
          onChange={event => setAnswer(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void submit(); }}
        />
        {checked === null ? (
          <button type="button" className="btn-primary" disabled={!answer.trim()} onClick={submit}>Check</button>
        ) : (
          <button type="button" className="btn-ghost" onClick={next}>Next</button>
        )}
      </div>

      {checked !== null ? (
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${checked ? 'text-emerald-700' : 'text-red-700'}`}>
            {checked ? '✓ Correct' : `✗ It's "${pattern.preposition}"`}
          </p>
          <p className="text-sm text-slate-700">{pattern.phrase}{pattern.example ? ` — ${pattern.example}` : ''}</p>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <span className="field-label">Now use it in a sentence (AI check)</span>
        <textarea
          className="field mt-1 min-h-16 resize-y"
          placeholder={`Write a sentence using "${pattern.phrase}"`}
          value={usage}
          onChange={event => setUsage(event.target.value)}
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn-primary" disabled={!usage.trim() || usageStatus === 'checking'} onClick={runUsageCheck}>
            {usageStatus === 'checking' ? 'Checking' : 'Check my sentence'}
          </button>
          {usageStatus === 'error' ? <span className="text-sm text-red-700">Could not check that.</span> : null}
        </div>
        {usageResult ? (
          <div className="mt-3 space-y-1">
            <p className={`text-sm font-semibold ${usageResult.correct ? 'text-emerald-700' : 'text-amber-700'}`}>
              {usageResult.correct ? '✓ Used correctly' : 'Not quite'}
            </p>
            <p className="text-sm text-slate-700">{usageResult.feedback}</p>
            <p className="text-sm text-slate-600">Model: {usageResult.modelSentence}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PatternsPanel() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [mode, setMode] = useState<Mode>('browse');
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const response = await getPatterns();
      setPatterns(Array.isArray(response?.items) ? response.items : []);
    } catch {
      // Leave the panel usable for adding even if the initial load fails.
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { void load(); }, []);

  const upsert = (pattern: Pattern) => {
    setPatterns(current => {
      const without = current.filter(item => item.id !== pattern.id);
      return [...without, pattern].sort((a, b) =>
        a.preposition.localeCompare(b.preposition) || a.phrase.localeCompare(b.phrase));
    });
  };

  const remove = async (id: number) => {
    try {
      await deletePattern(id);
      setPatterns(current => current.filter(item => item.id !== id));
    } catch {
      // ignore; user can retry
    }
  };

  return (
    <div className="space-y-4">
      <AddPatternBox onAdded={upsert} />

      <div className="flex rounded-full border border-slate-200 bg-white p-1" aria-label="patterns mode">
        {(['browse', 'drill'] as const).map(option => (
          <button
            key={option}
            type="button"
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              mode === option ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {option === 'browse' ? `Bank (${patterns.length})` : 'Drill'}
          </button>
        ))}
      </div>

      {!loaded ? (
        <p className="text-sm text-slate-500">Loading your patterns…</p>
      ) : mode === 'browse' ? (
        <BrowseList patterns={patterns} onDelete={remove} />
      ) : (
        <FillDrill patterns={patterns} onReviewed={upsert} />
      )}
    </div>
  );
}
