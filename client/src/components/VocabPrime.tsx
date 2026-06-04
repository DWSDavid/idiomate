import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { primeVocab } from '../api';

interface VocabPrimeProps {
  topic: string;
}

export function VocabPrime({ topic }: VocabPrimeProps) {
  const [vocab, setVocab] = useState<Vocab[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!topic) return;
    let alive = true;
    setStatus('loading');
    primeVocab(topic)
      .then(result => {
        if (!alive) return;
        setVocab(result.vocab);
        setStatus('idle');
      })
      .catch(() => {
        if (!alive) return;
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [topic]);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-label="vocab prime">
      <h2 className="text-lg font-semibold text-zinc-950">Vocab Prime</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {vocab.map(item => (
          <span key={item.normalized ?? item.word} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <span className="font-semibold">{item.word}</span>
            {item.defCn ? <span className="text-emerald-800"> — {item.defCn}</span> : null}
          </span>
        ))}
        {!vocab.length ? (
          <span className="text-sm text-zinc-500">
            {status === 'error' ? 'No vocab available.' : 'Loading vocab...'}
          </span>
        ) : null}
      </div>
    </section>
  );
}
