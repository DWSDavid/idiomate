import React, { useEffect, useState } from 'react';
import type { VocabListResponse } from '../../../shared/types';
import { getVocabList } from '../api';

interface VocabularyPanelProps {
  refreshKey?: number;
}

export function VocabularyPanel({ refreshKey = 0 }: VocabularyPanelProps) {
  const [vocab, setVocab] = useState<VocabListResponse>({ total: 0, items: [] });
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getVocabList()
      .then(result => {
        if (!alive) return;
        setVocab(result);
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
      <span className="section-label">My vocabulary ({vocab.total})</span>
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load vocabulary.</p> : null}
      {status === 'loading' ? <p className="mt-4 text-sm text-stone-500">Loading vocabulary.</p> : null}
      {status === 'idle' && vocab.items.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">No saved words yet.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {vocab.items.map(item => (
          <article key={`${item.word}-${item.lastCaptured ?? ''}`} className="rounded-lg border border-stone-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900">{item.word}</h2>
              <span className="chip">{item.kind}</span>
              <span className="chip">met {item.captureCount}x</span>
            </div>
            {item.defCn ? <p className="mt-2 text-sm text-stone-600">{item.defCn}</p> : null}
            <p className="mt-2 text-xs text-stone-500">
              used {item.timesUsed} / suggested {item.timesSuggested}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
