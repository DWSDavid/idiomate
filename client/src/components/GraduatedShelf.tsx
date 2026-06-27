import React, { useEffect, useState } from 'react';
import type { VocabListItem } from '../../../shared/types';
import { getGraduatedVocab } from '../api';

export function GraduatedShelf() {
  const [items, setItems] = useState<VocabListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'idle'>('loading');

  useEffect(() => {
    getGraduatedVocab()
      .then(res => {
        setItems(res.items);
        setStatus('idle');
      })
      .catch(() => setStatus('idle'));
  }, []);

  if (status === 'loading') {
    return (
      <section className="surface" aria-label="mastered words">
        <span className="section-label">Mastered</span>
        <p className="mt-4 text-sm text-stone-500">Loading...</p>
      </section>
    );
  }

  return (
    <section className="surface" aria-label="mastered words">
      <div>
        <span className="section-label">Mastered ({items.length})</span>
        <p className="mt-1 text-sm text-slate-500">Words you used correctly in a rewrite — graduated from active review.</p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">No mastered words yet — use a word correctly in your rewrite to graduate it here.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5"
            >
              <span className="text-sm font-medium text-emerald-900">{item.word}</span>
              {item.defCn ? (
                <span className="text-xs text-emerald-600">{item.defCn}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
