import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { getTodayVocab } from '../api';

interface TodayStripProps {
  refreshKey?: number;
}

export function TodayStrip({ refreshKey = 0 }: TodayStripProps) {
  const [items, setItems] = useState<Vocab[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="section-label">Today</span>
        {visible.map(item => (
          <span key={`${item.id ?? item.word}-${item.word}`} className="chip chip-blue">{item.word}</span>
        ))}
        {overflow > 0 ? <span className="chip">+{overflow} more</span> : null}
      </div>
    </section>
  );
}
