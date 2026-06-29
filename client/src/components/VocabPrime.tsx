import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { primeVocab } from '../api';

interface VocabPrimeProps {
  promptText: string;
  refreshKey?: number;
  onVocabChange?: (words: string[]) => void;
}

export function VocabPrime({ promptText, refreshKey = 0, onVocabChange }: VocabPrimeProps) {
  const [vocab, setVocab] = useState<Vocab[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!promptText) return;
    let alive = true;
    setStatus('loading');
    primeVocab(promptText, 10)
      .then(result => {
        if (!alive) return;
        setVocab(result.vocab);
        onVocabChange?.(result.vocab.map(v => v.word));
        setStatus('idle');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [promptText, refreshKey]);

  return (
    <section className="surface" aria-label="vocab prime">
      <span className="section-label">Words to work in</span>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {vocab.map(item => (
          <div key={item.normalized ?? item.word} className="rounded-lg border border-stone-200 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-stone-900">{item.word}</span>
              <div className="flex items-center gap-1">
                {item.pos ? <span className="chip chip-slate">{item.pos}</span> : null}
                {item.kind && item.kind !== 'word' ? <span className="chip">{item.kind}</span> : null}
              </div>
            </div>
            {item.defCn ? <p className="mt-0.5 text-sm leading-6 text-stone-500">{item.defCn}</p> : null}
          </div>
        ))}
        {!vocab.length ? (
          <p className="text-sm text-stone-500">
            {status === 'error'
              ? 'No vocabulary available yet.'
              : promptText
                ? 'Finding words that fit this prompt.'
                : 'Load a prompt to see words.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
