import React, { useEffect, useMemo, useState } from 'react';
import { getWordDeepDive, type WordDeepDiveResponse } from '../api';

interface WordDeepDivePanelProps {
  vocabId: number;
  word: string;
}

type DeepDiveStatus = 'idle' | 'loading' | 'loaded' | 'error';

const deepDiveCache = new Map<number, WordDeepDiveResponse>();

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

function inferFormRole(form: string, base: string): string {
  const lower = form.toLowerCase();
  const lowerBase = base.toLowerCase();
  if (lower === lowerBase) return 'base form / headword';
  if (lower.endsWith('ing')) return 'gerund or present participle';
  if (lower.endsWith('ed')) return 'past tense or past participle';
  if (lower.endsWith('tion') || lower.endsWith('ment') || lower.endsWith('ness')) return 'noun form';
  if (lower.endsWith('ive') || lower.endsWith('al') || lower.endsWith('ous') || lower.endsWith('ing')) return 'adjective form';
  if (lower.endsWith('s')) return 'third-person verb or plural noun';
  return 'same word family';
}

function exampleForForm(form: string, examples: string[]): string {
  const pattern = new RegExp(`\\b${escapeRegExp(form)}\\b`, 'i');
  return examples.find(example => pattern.test(example)) ?? examples[0] ?? '';
}

function highlightExactForm(text: string, form: string): React.ReactNode {
  if (!text) return '';
  const pattern = new RegExp(`\\b${escapeRegExp(form)}\\b`, 'i');
  const match = pattern.exec(text);
  if (!match) return text;
  const index = match.index;
  return (
    <>
      {text.slice(0, index)}
      <mark className="vocab-highlight">{text.slice(index, index + form.length)}</mark>
      {text.slice(index + form.length)}
    </>
  );
}

export function WordDeepDivePanel({ vocabId, word }: WordDeepDivePanelProps) {
  const [status, setStatus] = useState<DeepDiveStatus>('idle');
  const [details, setDetails] = useState<WordDeepDiveResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const cached = deepDiveCache.get(vocabId);
    if (cached) {
      setDetails(cached);
      setStatus('loaded');
      return () => {
        alive = false;
      };
    }

    setStatus('loading');
    setDetails(null);
    getWordDeepDive(vocabId)
      .then(result => {
        if (!alive) return;
        const normalized = normalizeDeepDive(result);
        deepDiveCache.set(vocabId, normalized);
        setDetails(normalized);
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
    return <p className="mt-3 text-sm text-slate-400">Loading...</p>;
  }

  if (status === 'error' || !details) {
    return <p className="mt-3 text-sm text-red-600">Could not load word details.</p>;
  }

  const familyWords = details.wordFamily.length ? details.wordFamily : [word];
  const exampleHighlightWords = familyWords.filter(item => !related.has(item.toLowerCase()));
  const richExamples = details.usageExamplesRich?.map(item => item.sentence) ?? [];
  const examples = richExamples.length ? richExamples : details.usageExamples;
  const baseWord = familyWords[0] ?? word;

  return (
    <div className="result-block mt-3 space-y-4">
      <section>
        <p className="field-label">Word family</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {familyWords.map(item => (
            <span
              key={item}
              className={related.has(item.toLowerCase()) ? 'chip chip-blue' : 'chip'}
              title={related.has(item.toLowerCase()) ? 'in your list' : undefined}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      <section>
        <p className="field-label">Family map</p>
        <div className="mt-2 space-y-2">
          {familyWords.map(item => {
            const example = exampleForForm(item, examples);
            return (
              <article key={`${item}-map`} className="rounded-lg border border-stone-200 bg-white/70 p-3 text-sm leading-6">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-slate-950">{item}</strong>
                  <span className="chip chip-slate">{inferFormRole(item, baseWord)}</span>
                  <span className="text-xs text-slate-500">core meaning: same family as {baseWord}</span>
                </div>
                {example ? (
                  <p className="mt-2 text-slate-600">{highlightExactForm(example, item)}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <p className="field-label">Compare</p>
        <div className="mt-2 space-y-2 text-sm leading-6 text-slate-500">
          {details.nearSynonyms.map(item => (
            <p key={item.word}>
              <strong className="text-slate-950">{item.word}</strong> - {item.distinction}
              {related.has(item.word.toLowerCase()) ? <span className="chip chip-blue ml-2">in your list</span> : null}
            </p>
          ))}
        </div>
      </section>

      <section>
        <p className="field-label">In use</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-500">
          {details.usageExamples.slice(0, 3).map(example => (
            <li key={example}>{highlightFamilyWords(example, exampleHighlightWords)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
