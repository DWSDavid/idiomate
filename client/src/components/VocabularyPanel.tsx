import React, { useEffect, useState } from 'react';
import type { VocabListResponse } from '../../../shared/types';
import { getVocabList, mergeVocabFamilies } from '../api';
import { VocabNetworkPanel } from './VocabNetworkPanel';
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
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [mergeStatus, setMergeStatus] = useState<'idle' | 'merging' | 'error'>('idle');
  const [mergeKey, setMergeKey] = useState(0);

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
  }, [refreshKey, mergeKey]);

  const handleMergeFamilies = async () => {
    if (mergeStatus === 'merging') return;
    setMergeStatus('merging');
    try {
      await mergeVocabFamilies();
      setMergeStatus('idle');
      setMergeKey(value => value + 1);
    } catch {
      setMergeStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="my vocabulary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-label">My vocabulary ({vocab.total})</span>
          <p className="mt-2 text-sm leading-6 text-slate-500">Top 30 by activation priority, weighted by how often you have met each word.</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {status === 'idle' && vocab.total > 0 ? (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={mergeStatus === 'merging'}
              onClick={handleMergeFamilies}
            >
              {mergeStatus === 'merging' ? 'Merging' : 'Merge families'}
            </button>
          ) : null}
          <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(value => !value)}>
            {open ? 'Close vocabulary' : 'Open vocabulary'}
          </button>
        </div>
      </div>
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load vocabulary.</p> : null}
      {mergeStatus === 'error' ? <p className="mt-4 text-sm text-red-700">Could not merge word families.</p> : null}
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
                      <button
                        type="button"
                        className="flex flex-wrap items-center gap-2 text-left"
                        onClick={() => setRevealedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
                          return next;
                        })}
                        title={revealedIds.has(item.id) ? 'Hide definition' : 'Reveal definition'}
                      >
                        <h2 className="text-base font-semibold text-slate-950">{item.word}</h2>
                        <span className="chip">{item.kind}</span>
                        {item.pos ? <span className="chip chip-slate">{item.pos}</span> : null}
                        <span className="chip chip-blue">met {item.captureCount}x</span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-slate-400"
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      >
                        {expandedId === item.id ? 'Close' : 'Details'}
                      </button>
                    </div>
                    {revealedIds.has(item.id) && item.defCn ? (
                      <p className="mt-2 text-sm text-slate-600">{item.defCn}</p>
                    ) : null}
                    {!revealedIds.has(item.id) && item.defCn ? (
                      <p className="mt-1 text-xs text-slate-400 select-none">tap word to reveal</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
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
          <VocabNetworkPanel items={vocab.items} />
        </div>
      ) : null}
    </section>
  );
}
