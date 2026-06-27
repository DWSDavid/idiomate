import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { getTodayVocab } from '../api';

interface TodayStripProps {
  refreshKey?: number;
}

export function TodayStrip({ refreshKey = 0 }: TodayStripProps) {
  const [items, setItems] = useState<Vocab[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setExpandedId(null);
    getTodayVocab()
      .then(result => {
        if (alive) setItems(result.items ?? []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!items?.length) return null;

  const visible = items.slice(0, 5);
  const overflow = items.length - visible.length;

  return (
    <section className="surface" aria-label="today vocabulary">
      <span className="section-label">Today</span>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {visible.map(item => (
          <span key={`${item.id ?? item.word}-${item.word}`} className="flex flex-col items-start gap-0.5">
            <button
              type="button"
              className="chip chip-blue"
              onClick={() => setExpandedId(prev => prev === (item.id ?? null) ? null : (item.id ?? null))}
            >
              {item.word}
            </button>
            {expandedId === item.id && (item.defCn || item.pos) ? (
              <span className="pl-1 text-xs text-slate-500">
                {item.pos ? <span className="font-medium">{item.pos}</span> : null}
                {item.pos && item.defCn ? <span> · </span> : null}
                {item.defCn ? <span>{item.defCn}</span> : null}
              </span>
            ) : null}
          </span>
        ))}
        {overflow > 0 ? <span className="text-sm text-slate-500">+{overflow} more</span> : null}
      </div>
    </section>
  );
}
