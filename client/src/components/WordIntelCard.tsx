import React from 'react';

interface UsageExampleRich {
  sentence: string;
  role?: string;
}

interface NearSynonym {
  word: string;
  distinction: string;
}

interface WordIntelCardProps {
  word: string;
  wordFamily: string[];
  usageExamplesRich?: UsageExampleRich[];
  usageExamples?: string[];
  nearSynonyms?: NearSynonym[];
  onDismiss: () => void;
}

export function highlightSentence(sentence: string, family: string[]): React.ReactNode {
  const forms = Array.from(new Set(family.map(item => item.trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
  const lowerSentence = sentence.toLowerCase();

  for (const form of forms) {
    const index = lowerSentence.indexOf(form.toLowerCase());
    if (index === -1) continue;
    const match = sentence.slice(index, index + form.length);
    return (
      <>
        {sentence.slice(0, index)}
        <mark className="vocab-highlight">{match}</mark>
        {sentence.slice(index + form.length)}
      </>
    );
  }

  return sentence;
}

export function WordIntelCard({
  word,
  wordFamily,
  usageExamplesRich,
  usageExamples,
  nearSynonyms,
  onDismiss,
}: WordIntelCardProps) {
  const richExample = usageExamplesRich?.find(item => item.sentence.trim());
  const sentence = richExample?.sentence ?? usageExamples?.find(item => item.trim());
  if (!sentence) return null;

  const family = Array.from(new Set([word, ...wordFamily].map(item => item.trim()).filter(Boolean)));
  const synonyms = (nearSynonyms ?? []).slice(0, 3);

  return (
    <aside className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4" aria-label="word intelligence">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm leading-6 text-slate-700">{highlightSentence(sentence, family)}</p>
          {richExample?.role ? (
            <span className="chip chip-slate mt-3 inline-flex">{richExample.role}</span>
          ) : null}
        </div>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={onDismiss}>
          Got it
        </button>
      </div>
      {synonyms.length ? (
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {synonyms.map(item => (
            <li key={item.word}>
              <strong className="font-semibold text-slate-900">{item.word}</strong>
              {' - '}
              {item.distinction}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
