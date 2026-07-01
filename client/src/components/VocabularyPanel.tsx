import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VocabListItem, VocabListResponse } from '../../../shared/types';
import { getAllVocab, getVocabList, mergeVocabFamilies } from '../api';
import { VocabNetworkPanel } from './VocabNetworkPanel';
import { WordDeepDivePanel } from './WordDeepDivePanel';

interface VocabularyPanelProps {
  refreshKey?: number;
  active?: boolean;
  autoRefreshMs?: number;
}

const BROWSE_PAGE_SIZE = 50;
type BrowseScope = 'all' | 'website';

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
  if (source === 'website_reading') return 'Website';
  if (source === 'capture') return 'Capture';
  if (source === 'import' || source === 'youdao') return 'Import';
  return source;
}

function sourceBadgeClass(source: string | undefined): string {
  if (!source) return 'chip chip-slate';
  if (source.startsWith('listen')) return 'chip chip-blue';
  if (source === 'website_reading') return 'chip chip-emerald';
  if (source === 'capture') return 'chip';
  return 'chip chip-slate';
}

function sourceHost(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function primaryExample(item: VocabListItem): string {
  const generatedExample = item.examples?.find(example => example.trim())?.trim();
  if (generatedExample) return generatedExample;
  const context = item.contextSentence?.trim() ?? '';
  if (!context || /^From .+: https?:\/\//.test(context)) return '';
  return context;
}

function speakVocabWord(word: string) {
  if (!('speechSynthesis' in globalThis) || !('SpeechSynthesisUtterance' in globalThis)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.86;
  globalThis.speechSynthesis.cancel();
  globalThis.speechSynthesis.speak(utterance);
}

function scopeDescription(scope: BrowseScope, total: number): string {
  if (scope === 'website') {
    return `${total} webpage-sourced ${total === 1 ? 'word is' : 'words are'} still counted inside My vocabulary. This is only a filtered source view.`;
  }
  return `${total} total ${total === 1 ? 'word' : 'words'} across every source, newest first.`;
}

function VocabCard({ item, expandedId, setExpandedId, revealedIds, setRevealedIds, showDate = false }: {
  item: VocabListItem;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  revealedIds: Set<number>;
  setRevealedIds: (fn: (prev: Set<number>) => Set<number>) => void;
  showDate?: boolean;
}) {
  const label = sourceLabel(item.source);
  const dateStr = showDate ? item.dateAdded ? item.dateAdded.slice(0, 10) : item.capturedDate ?? '' : '';
  const example = primaryExample(item);
  const sourceName = item.sourceTitle?.trim() || sourceHost(item.sourceUrl);
  return (
    <article className="vocab-row">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
            <span className="chip chip-blue">seen {item.captureCount} total</span>
            {label ? <span className={sourceBadgeClass(item.source)}>{label}</span> : null}
            {dateStr ? <span className="chip chip-slate">{dateStr}</span> : null}
          </button>
          <button
            type="button"
            className="vocab-action"
            aria-label={`Play pronunciation for ${item.word}`}
            title={`Play pronunciation for ${item.word}`}
            onClick={() => speakVocabWord(item.word)}
          >
            Hear
          </button>
        </div>
        <button
          type="button"
          className="vocab-detail-button"
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
      {example ? (
        <div className="vocab-example">
          <p className="vocab-mini-label">Context example</p>
          <p className="mt-1 text-sm leading-6 text-slate-800">{example}</p>
        </div>
      ) : null}
      {sourceName ? (
        <div className="vocab-source">
          <span className="vocab-mini-label">Origin</span>
          {item.sourceUrl ? (
            <a className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-indigo-700" href={item.sourceUrl} target="_blank" rel="noreferrer">
              {sourceName}
            </a>
          ) : (
            <span className="font-semibold text-slate-700">{sourceName}</span>
          )}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        used {item.timesUsed} / suggested {item.timesSuggested}
      </p>
      {expandedId === item.id ? (
        <WordDeepDivePanel key={item.id} vocabId={item.id} word={item.word} />
      ) : null}
    </article>
  );
}

function BrowseItem(props: Omit<React.ComponentProps<typeof VocabCard>, 'showDate'>) {
  return <VocabCard {...props} showDate />;
}

export function VocabularyPanel({ refreshKey = 0, active = true, autoRefreshMs = 10000 }: VocabularyPanelProps) {
  const [vocab, setVocab] = useState<VocabListResponse>({ total: 0, items: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [mergeStatus, setMergeStatus] = useState<'idle' | 'merging' | 'error'>('idle');
  const [mergeKey, setMergeKey] = useState(0);

  // Browse mode state
  const [browseMode, setBrowseMode] = useState(false);
  const [browseScope, setBrowseScope] = useState<BrowseScope>('all');
  const [browsePage, setBrowsePage] = useState(0);
  const [browseData, setBrowseData] = useState<VocabListResponse>({ total: 0, items: [] });
  const [browseStatus, setBrowseStatus] = useState<'loading' | 'idle' | 'error'>('idle');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!active) return;
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
  }, [active, refreshKey, mergeKey, reloadKey]);

  useEffect(() => {
    if (!active || !browseMode) return;
    let alive = true;
    setBrowseStatus('loading');
    getAllVocab({
      offset: browsePage * BROWSE_PAGE_SIZE,
      limit: BROWSE_PAGE_SIZE,
      sort: 'date',
      source: browseScope === 'website' ? 'website_reading' : undefined,
    })
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
  }, [active, browseMode, browsePage, browseScope, mergeKey, reloadKey]);

  useEffect(() => {
    if (!active) return;
    const requestReload = () => setReloadKey(key => key + 1);
    const handleVisibility = () => {
      if (!document.hidden) requestReload();
    };
    globalThis.addEventListener?.('focus', requestReload);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = globalThis.setInterval(() => {
      if (!document.hidden) requestReload();
    }, autoRefreshMs);
    return () => {
      globalThis.removeEventListener?.('focus', requestReload);
      document.removeEventListener('visibilitychange', handleVisibility);
      globalThis.clearInterval(timer);
    };
  }, [active, autoRefreshMs]);

  useEffect(() => {
    if (!browseMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleCloseBrowse();
    };
    globalThis.addEventListener?.('keydown', onKeyDown);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown);
  }, [browseMode]);

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

  const handleOpenBrowse = (scope: BrowseScope) => {
    setBrowseScope(scope);
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
  const browseTitle = browseScope === 'website' ? 'Website vocabulary' : 'All vocabulary';
  const browseSubtitle = browseScope === 'website'
    ? `Captured with page title, URL, and reading context when available. Page ${browsePage + 1} of ${totalBrowsePages || 1}.`
    : `Newest first. Page ${browsePage + 1} of ${totalBrowsePages || 1}.`;
  const browseOverlay = browseMode ? (
    <div
      className="vocab-browse-overlay"
      role="presentation"
      data-testid="vocab-browser-overlay"
      onClick={handleCloseBrowse}
    >
      <div
        className="vocab-browse-shell"
        role="dialog"
        aria-modal="true"
        aria-label={browseTitle.toLowerCase()}
        onClick={event => event.stopPropagation()}
      >
        <div className="vocab-browse-header">
          <div className="min-w-0">
            <span className="section-label">{browseTitle} ({browseData.total})</span>
            <p className="mt-2 text-sm leading-6 text-slate-500">{browseSubtitle}</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{scopeDescription(browseScope, browseData.total)}</p>
          </div>
          <button type="button" className="btn-ghost shrink-0 text-xs" onClick={handleCloseBrowse}>
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8">
          {browseStatus === 'loading' ? <p className="text-sm text-stone-500">Loading.</p> : null}
          {browseStatus === 'error' ? <p className="text-sm text-red-700">Could not load vocabulary.</p> : null}
          {browseStatus === 'idle' && browseData.items.length === 0 ? (
            <div className="vocab-empty-state">
              <p className="font-semibold text-slate-900">No words found in this view.</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {browseScope === 'website'
                  ? 'New extension captures will appear here when they include webpage source data.'
                  : 'Your saved words will appear here once the vocabulary list has entries.'}
              </p>
            </div>
          ) : null}

          {browseStatus === 'idle' && browseData.items.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
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
            </div>
          ) : null}
        </div>

        <div className="vocab-browse-footer">
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={browsePage === 0}
            onClick={() => { setBrowsePage(p => p - 1); setExpandedId(null); }}
          >
            Prev
          </button>
          <span className="text-xs text-slate-500">
            {browseData.total > 0
              ? `${browsePage * BROWSE_PAGE_SIZE + 1}-${Math.min((browsePage + 1) * BROWSE_PAGE_SIZE, browseData.total)} of ${browseData.total}`
              : `0 of ${browseData.total}`}
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
    </div>
  ) : null;

  return (
    <section className="surface" aria-label="my vocabulary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="section-label">My vocabulary ({vocab.total})</span>
          <p className="mt-2 text-sm leading-6 text-slate-500">Latest saved and re-met words first, so new captures surface immediately.</p>
          <div className="vocab-scope-strip" aria-label="vocabulary source note">
            <span>All saved words count here</span>
            <span>Website vocab is a filtered view</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {status === 'idle' && vocab.total > 0 ? (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setReloadKey(key => key + 1)}
            >
              Refresh
            </button>
          ) : null}
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
          {status === 'idle' && vocab.total > 0 ? (
            <button type="button" className="btn-ghost text-xs" onClick={() => handleOpenBrowse('website')}>
              Website vocab
            </button>
          ) : null}
          {status === 'idle' && vocab.total > 0 ? (
            <button type="button" className="btn-ghost text-xs" onClick={() => handleOpenBrowse('all')}>
              Browse all
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
                  <VocabCard
                    key={item.id}
                    item={item}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    revealedIds={revealedIds}
                    setRevealedIds={setRevealedIds}
                  />
                ))}
              </div>
            </div>
          ))}
          <VocabNetworkPanel items={vocab.items} />
        </div>
      ) : null}

      {browseOverlay ? createPortal(browseOverlay, document.body) : null}
    </section>
  );
}
