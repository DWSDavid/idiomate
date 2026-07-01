import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { primeVocab } from '../api';

interface VocabPrimeProps {
  promptText: string;
  refreshKey?: number;
  onVocabChange?: (words: string[]) => void;
}

const vocabPrimeCache = new Map<string, Vocab[]>();

export function VocabPrime({ promptText, refreshKey = 0, onVocabChange }: VocabPrimeProps) {
  const [vocab, setVocab] = useState<Vocab[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const groupedVocab = {
    chunks: vocab.filter(item => item.kind === 'phrase' || item.kind === 'collocation' || item.word.trim().includes(' ')),
    words: vocab.filter(item => item.kind !== 'phrase' && item.kind !== 'collocation' && !item.word.trim().includes(' ')),
  };

  useEffect(() => {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) {
      setVocab([]);
      onVocabChange?.([]);
      setStatus('idle');
      return;
    }
    const cacheKey = `${trimmedPrompt}\u0000${refreshKey}`;
    const cached = vocabPrimeCache.get(cacheKey);
    if (cached) {
      setVocab(cached);
      onVocabChange?.(cached.map(v => v.word));
      setStatus('idle');
      return;
    }
    let alive = true;
    setStatus('loading');
    primeVocab(trimmedPrompt, 10)
      .then(result => {
        if (!alive) return;
        vocabPrimeCache.set(cacheKey, result.vocab);
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
      <div className="mt-4 space-y-4">
        {groupedVocab.chunks.length ? (
          <VocabPrimeGroup title="Chunks / fixed combos" items={groupedVocab.chunks} />
        ) : null}
        {groupedVocab.words.length ? (
          <VocabPrimeGroup title="Single words" items={groupedVocab.words} />
        ) : null}
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

function VocabPrimeGroup({ title, items }: { title: string; items: Vocab[] }) {
  return (
    <section>
      <p className="field-label">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map(item => (
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
      </div>
    </section>
  );
}
