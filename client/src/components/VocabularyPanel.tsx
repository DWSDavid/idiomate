import React, { useEffect, useState } from 'react';
import type { VocabListItem, VocabListResponse } from '../../../shared/types';
import { getAllVocab, getVocabList, mergeVocabFamilies } from '../api';
import { VocabNetworkPanel } from './VocabNetworkPanel';
import { WordDeepDivePanel } from './WordDeepDivePanel';

interface VocabularyPanelProps {
  refreshKey?: number;
}

const BROWSE_PAGE_SIZE = 50;

function groupByCapturedDate(items: VocabListResponse['items']): Array<{ date: string; items: VocabListResponse['items'] }> {
  const groups = new Map<string, VocabListResponse['items']>();
  for (const item of items) {
    const date = item.capturedDate ?? item.lastCaptured?.slice(0, 10) ?? 'No date';
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return Array.from(groups.entries()).map(([date, groupedItems]) => ({ date, items: groupedItems }));
}

function sourceLabel(source: string | undefined): string {
  if (!source) return '';
  if (source.startsWith('listen')) return 'Listen';
  if (source === 'capture') return 'Capture';
  if (source === 'import' || source === 'youdao') return 'Import';
  return source;
}

function sourceBadgeClass(source: string | undefined): string {
  if (!source) return 'chip chip-slate';
  if (source.startsWith('listen')) return 'chip chip-blue';
  if (source === 'capture') return 'chip';
  return 'chip chip-slate';
}

function BrowseItem({ item, expandedId, setExpandedId, revealedIds, setRevealedIds }: {
  item: VocabListItem;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  revealedIds: Set<number>;
  setRevealedIds: (fn: (prev: Set<number>) => Set<number>) => void;
}) {
  const label = sourceLabel(item.source);
  const dateStr = item.dateAdded ? item.dateAdded.slice(0, 10) : item.capturedDate ?? '';
  return (
    <article className="vocab-row">
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
          {label ? <span className={sourceBadgeClass(item.source)}>{label}</span> : null}
          {dateStr ? <span className="chip chip-slate">{dateStr}</span> : null}
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
  );
}

export function VocabularyPanel({ refreshKey = 0 }: VocabularyPanelProps) {
  const [vocab, setVocab] = useState<VocabListResponse>({ total: 0, items: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [mergeStatus, setMergeStatus] = useState<'idle' | 'merging' | 'error'>('idle');
  const [mergeKey, setMergeKey] = useState(0);

  // Browse mode state
  const [browseMode, setBrowseMode] = useState(false);
  const [browsePage, setBrowsePage] = useState(0);
  const [browseData, setBrowseData] = useState<VocabListResponse>({ total: 0, items: [] });
  const [browseStatus, setBrowseStatus] = useState<'loading' | 'idle' | 'error'>('idle');

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

  useEffect(() => {
    if (!browseMode) return;
    let alive = true;
    setBrowseStatus('loading');
    getAllVocab({ offset: browsePage * BROWSE_PAGE_SIZE, limit: BROWSE_PAGE_SIZE, sort: 'date' })
      .then(result => {
        if (!alive) return;
        setBrowseData(result);
        setBrowseStatus('idle');
      })
      .catch(() => {
        if (alive) setBrowseStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [browseMode, browsePage, mergeKey]);

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

  const handleOpenBrowse = () => {
    setBrowseMode(true);
    setBrowsePage(0);
    setExpandedId(null);
    setRevealedIds(new Set());
  };

  const handleCloseBrowse = () => {
    setBrowseMode(false);
    setBrowsePage(0);
    setExpandedId(null);
    setRevealedIds(new Set());
  };

  const totalBrowsePages = Math.ceil(browseData.total / BROWSE_PAGE_SIZE);

  return (
    <section className="surface" aria-label="my vocabulary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-label">My vocabulary ({vocab.total})</span>
          {!browseMode ? (
            <p className="mt-2 text-sm leading-6 text-slate-500">Top 30 by activation priority, weighted by how often you have met each word.</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-500">All words, newest first. Page {browsePage + 1} of {totalBrowsePages || 1}.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {!browseMode && status === 'idle' && vocab.total > 0 ? (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={mergeStatus === 'merging'}
              onClick={handleMergeFamilies}
            >
              {mergeStatus === 'merging' ? 'Merging' : 'Merge families'}
            </button>
          ) : null}
          {!browseMode && status === 'idle' && vocab.total > 0 ? (
            <button type="button" className="btn-ghost text-xs" onClick={handleOpenBrowse}>
              Browse all
            </button>
          ) : null}
          {browseMode ? (
            <button type="button" className="btn-ghost text-xs" onClick={handleCloseBrowse}>
              Back to top 30
            </button>
          ) : null}
          <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(value => !value)}>
            {open ? 'Close vocabulary' : 'Open vocabulary'}
          </button>
        </div>
      </div>
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load vocabulary.</p> : null}
      {mergeStatus === 'error' ? <p className="mt-4 text-sm text-red-700">Could not merge word families.</p> : null}

      {!browseMode ? (
        <>
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
        </>
      ) : (
        <>
          {browseStatus === 'loading' ? <p className="mt-4 text-sm text-stone-500">Loading.</p> : null}
          {browseStatus === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load vocabulary.</p> : null}
          {browseStatus === 'idle' && browseData.items.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">No words found.</p>
          ) : null}

          {open && browseStatus === 'idle' && browseData.items.length > 0 ? (
            <div className="mt-4 space-y-2">
              {browseData.items.map(item => (
                <BrowseItem
                  key={item.id}
                  item={item}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  revealedIds={revealedIds}
                  setRevealedIds={setRevealedIds}
                />
              ))}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={browsePage === 0}
                  onClick={() => { setBrowsePage(p => p - 1); setExpandedId(null); }}
                >
                  Prev
                </button>
                <span className="text-xs text-slate-500">
                  {browsePage * BROWSE_PAGE_SIZE + 1}–{Math.min((browsePage + 1) * BROWSE_PAGE_SIZE, browseData.total)} of {browseData.total}
                </span>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={(browsePage + 1) * BROWSE_PAGE_SIZE >= browseData.total}
                  onClick={() => { setBrowsePage(p => p + 1); setExpandedId(null); }}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
