import React, { useEffect, useState } from 'react';
import type { WritingHistoryEntry, WritingHistoryResponse } from '../../../shared/types';
import { getHistory } from '../api';

type SourceFilter = 'all' | 'daily_writing' | 'free_writing';

const SOURCE_FILTER_TABS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'daily_writing', label: 'Daily' },
  { id: 'free_writing', label: 'Free (随手写)' },
];

function sourceBadgeLabel(source: WritingHistoryEntry['source']): string {
  if (source === 'free_writing') return 'Free';
  if (source === 'daily_writing') return 'Daily';
  if (source === 'speaking_review') return 'Speaking review';
  if (source === 'coach_review') return 'Coach';
  if (source === 'sentence_lab') return 'Sentence lab';
  return source.replace(/_/g, ' ');
}

interface HistoryPanelProps {
  refreshKey?: number;
}

function dateLabel(entry: WritingHistoryEntry): string {
  return entry.date?.slice(0, 10) ?? entry.createdAt?.slice(0, 10) ?? 'No date';
}

function safeExternalHref(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function HistoryContextUrl({ value }: { value: string }) {
  const href = safeExternalHref(value);
  if (!href) {
    return <span className="break-all">{value}</span>;
  }
  return (
    <a className="break-all text-emerald-800 underline" href={href} target="_blank" rel="noreferrer">
      {value}
    </a>
  );
}

function HistoryVersion({ label, text, tone = 'emerald' }: { label: string; text?: string; tone?: 'emerald' | 'violet' | 'amber' }) {
  if (!text) return null;
  const toneClass = tone === 'violet'
    ? 'bg-violet-50 text-violet-900'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-900'
      : 'bg-emerald-50 text-emerald-900';
  return (
    <div className={`mt-3 rounded-xl p-3 text-sm leading-6 ${toneClass}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export function HistoryPanel({ refreshKey = 0 }: HistoryPanelProps) {
  const [history, setHistory] = useState<WritingHistoryResponse>({ entries: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const apiSource = sourceFilter === 'all' ? undefined : sourceFilter;
    getHistory(100, apiSource)
      .then(result => {
        if (!alive) return;
        setHistory(result);
        setStatus('idle');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, sourceFilter]);

  return (
    <section className="surface" aria-label="writing history">
      <span className="section-label">Writing history</span>
      <div className="mt-3 flex gap-1" role="group" aria-label="Filter by writing type">
        {SOURCE_FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${sourceFilter === tab.id ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
            aria-pressed={sourceFilter === tab.id}
            onClick={() => setSourceFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {status === 'loading' ? <p className="mt-4 text-sm text-slate-500">Loading history.</p> : null}
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load history.</p> : null}
      {status === 'idle' && (history.entries?.length ?? 0) === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No reviewed writing yet.</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {(history.entries ?? []).map(entry => (
          <article key={`${entry.source}-${entry.id}`} className="history-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{sourceBadgeLabel(entry.source)}</span>
              <span className="text-xs font-semibold text-slate-400">{dateLabel(entry)}</span>
              {entry.annotations.length ? <span className="chip chip-blue">{entry.annotations.length} notes</span> : null}
            </div>
            {entry.context ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white/75 p-3 text-xs leading-5 text-slate-500">
                {entry.context.title ? <p className="font-semibold text-slate-800">{entry.context.title}</p> : null}
                {entry.context.url ? (
                  <HistoryContextUrl value={entry.context.url} />
                ) : null}
                {entry.context.excerpt ? <p className="mt-2">{entry.context.excerpt}</p> : null}
              </div>
            ) : null}
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Original</p>
              <p className="prose whitespace-pre-wrap text-base text-slate-800">{entry.draftText}</p>
            </div>
            <HistoryVersion label="Your rewrite / saved final" text={entry.finalText} />
            <HistoryVersion label="Grammar polished" text={entry.nativeText} />
            <HistoryVersion label="Elevated version" text={entry.elevatedText} tone="violet" />
            <HistoryVersion label="Evidence highlighted version" text={entry.evidenceText} tone="amber" />
            {entry.annotations.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.annotations.map(annotation => (
                  <span key={`${entry.id}-${annotation.span}-${annotation.errorType}`} className="chip">
                    {annotation.errorType.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
