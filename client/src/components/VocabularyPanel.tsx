import React, { useEffect, useState } from 'react';
import type { VocabListResponse } from '../../../shared/types';
import { getVocabList } from '../api';
import { WordDeepDivePanel } from './WordDeepDivePanel';

interface VocabularyPanelProps {
  refreshKey?: number;
}

function groupByCapturedDate(items: VocabListResponse['items']): Array<{ date: string; items: VocabListResponse['items'] }> {
  const groups = new Map<string, VocabListResponse['items']>();
  for (const item of items) {
    const date = item.capturedDate ?? item.lastCaptured?.slice(0, 10) ?? 'No date';
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return Array.from(groups.entries()).map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

export function VocabularyPanel({ refreshKey = 0 }: VocabularyPanelProps) {
  const [vocab, setVocab] = useState<VocabListResponse>({ total: 0, items: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getVocabList(30)
      .then(result => {
        if (!alive) return;
        setVocab(result);
        setExpandedId(null);
        setStatus('idle');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <section className="surface" aria-label="my vocabulary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-label">My vocabulary ({vocab.total})</span>
          <p className="mt-2 text-sm leading-6 text-slate-500">Top 30 by activation priority, weighted by how often you have met each word.</p>
        </div>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={() => setOpen(value => !value)}>
          {open ? 'Close vocabulary' : 'Open vocabulary'}
        </button>
      </div>
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load vocabulary.</p> : null}
      {status === 'loading' ? <p className="mt-4 text-sm text-stone-500">Loading vocabulary.</p> : null}
      {status === 'idle' && vocab.items.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">No saved words yet.</p>
      ) : null}

      {open ? (
        <div className="mt-4 space-y-3">
          {groupByCapturedDate(vocab.items).map(group => (
            <div key={group.date} className="vocab-day-group">
              <p className="vocab-day-label">{group.date}</p>
              <div className="mt-2 space-y-2">
                {group.items.map(item => (
                  <article key={item.id} className="vocab-row">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-slate-950">{item.word}</h2>
                        <span className="chip">{item.kind}</span>
                        {item.pos ? <span className="chip chip-slate">{item.pos}</span> : null}
                        <span className="chip chip-blue">met {item.captureCount}x</span>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-400"
                        onClick={() => setExpandedId(item.id)}
                      >
                        Details
                      </button>
                      {expandedId === item.id ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-slate-400"
                          onClick={() => setExpandedId(null)}
                        >
                          Close
                        </button>
                      ) : null}
                    </div>
                    {item.defCn ? <p className="mt-2 text-sm text-slate-600">{item.defCn}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      used {item.timesUsed} / suggested {item.timesSuggested}
                    </p>
                    {expandedId === item.id ? (
                      <WordDeepDivePanel key={item.id} vocabId={item.id} word={item.word} />
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
