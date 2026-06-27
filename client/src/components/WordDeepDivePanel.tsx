import React, { useEffect, useMemo, useState } from 'react';
import { getWordDeepDive, type WordDeepDiveResponse } from '../api';

interface WordDeepDivePanelProps {
  vocabId: number;
  word: string;
}

type DeepDiveStatus = 'idle' | 'loading' | 'loaded' | 'error';

function normalizeDeepDive(data: WordDeepDiveResponse): WordDeepDiveResponse {
  return {
    wordFamily: data.wordFamily ?? [],
    nearSynonyms: data.nearSynonyms ?? [],
    usageExamples: data.usageExamples ?? [],
    relatedInYourList: data.relatedInYourList ?? [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightFamilyWords(text: string, familyWords: string[]): React.ReactNode[] {
  const terms = familyWords
    .map(value => value.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return [text];

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, index) => (
    terms.some(term => term.toLowerCase() === part.toLowerCase())
      ? <strong key={`${part}-${index}`}>{part}</strong>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
}

export function WordDeepDivePanel({ vocabId, word }: WordDeepDivePanelProps) {
  const [status, setStatus] = useState<DeepDiveStatus>('idle');
  const [details, setDetails] = useState<WordDeepDiveResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setDetails(null);
    getWordDeepDive(vocabId)
      .then(result => {
        if (!alive) return;
        setDetails(normalizeDeepDive(result));
        setStatus('loaded');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [vocabId]);

  const related = useMemo(
    () => new Set((details?.relatedInYourList ?? []).map(item => item.toLowerCase())),
    [details],
  );

  if (status === 'idle' || status === 'loading') {
    return <p className="mt-3 text-sm text-stone-500">Loading...</p>;
  }

  if (status === 'error' || !details) {
    return <p className="mt-3 text-sm text-red-700">Could not load word details.</p>;
  }

  const familyWords = details.wordFamily.length ? details.wordFamily : [word];
  const exampleHighlightWords = familyWords.filter(item => !related.has(item.toLowerCase()));

  return (
    <div className="result-block mt-3 space-y-4">
      <section>
        <p className="section-label">Word family</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {familyWords.map(item => (
            <span key={item} className={related.has(item.toLowerCase()) ? 'chip chip-blue' : 'chip'}>
              {item}
            </span>
          ))}
        </div>
      </section>

      <section>
        <p className="section-label">Compare</p>
        <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
          {details.nearSynonyms.map(item => (
            <p key={item.word}>
              <strong className="text-slate-950">{item.word}</strong> - {item.distinction}
              {related.has(item.word.toLowerCase()) ? <span className="chip chip-blue ml-2">in your list</span> : null}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="section-label">In use</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
          {details.usageExamples.slice(0, 3).map(example => (
            <li key={example}>{highlightFamilyWords(example, exampleHighlightWords)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
