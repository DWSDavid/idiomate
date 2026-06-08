import React, { useEffect, useState } from 'react';
import type { WritingHistoryEntry, WritingHistoryResponse } from '../../../shared/types';
import { getHistory } from '../api';

function sourceLabel(source: WritingHistoryEntry['source']): string {
  return source.replace(/_/g, ' ');
}

function dateLabel(entry: WritingHistoryEntry): string {
  return entry.date?.slice(0, 10) ?? entry.createdAt?.slice(0, 10) ?? 'No date';
}

export function HistoryPanel() {
  const [history, setHistory] = useState<WritingHistoryResponse>({ entries: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getHistory()
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
  }, []);

  return (
    <section className="surface" aria-label="writing history">
      <span className="section-label">Writing history</span>
      {status === 'loading' ? <p className="mt-4 text-sm text-slate-500">Loading history.</p> : null}
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load history.</p> : null}
      {status === 'idle' && history.entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No reviewed writing yet.</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {history.entries.map(entry => (
          <article key={`${entry.source}-${entry.id}`} className="history-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{sourceLabel(entry.source)}</span>
              <span className="text-xs font-semibold text-slate-400">{dateLabel(entry)}</span>
              {entry.annotations.length ? <span className="chip chip-blue">{entry.annotations.length} notes</span> : null}
            </div>
            <p className="prose mt-3 whitespace-pre-wrap text-base text-slate-800">{entry.draftText}</p>
            {entry.finalText ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{entry.finalText}</p>
            ) : null}
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
