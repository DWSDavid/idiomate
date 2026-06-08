import React from 'react';
import type { Annotation } from '../../../shared/types';

export interface ComparedAnnotation extends Annotation {
  accepted?: boolean;
  userRewrite?: string;
}

interface CompareViewProps {
  original: string;
  rewrite: string;
  nativeVersion?: string;
  annotations: ComparedAnnotation[];
}

// Word-level LCS: returns indices in nativeVersion that differ from the user's rewrite.
function changedNativeWords(userRewrite: string, nativeVersion: string): Set<number> {
  const userWords = userRewrite.trim().split(/\s+/).filter(Boolean);
  const nativeWords = nativeVersion.trim().split(/\s+/).filter(Boolean);
  const dp = Array.from({ length: userWords.length + 1 }, () => Array(nativeWords.length + 1).fill(0));

  for (let i = userWords.length - 1; i >= 0; i -= 1) {
    for (let j = nativeWords.length - 1; j >= 0; j -= 1) {
      dp[i][j] = userWords[i] === nativeWords[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const unchanged = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < userWords.length && j < nativeWords.length) {
    if (userWords[i] === nativeWords[j]) {
      unchanged.add(j);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return new Set(nativeWords.map((_, index) => index).filter(index => !unchanged.has(index)));
}

function NativeVersion({ rewrite, nativeVersion }: { rewrite: string; nativeVersion: string }) {
  const nativeWords = nativeVersion.trim().split(/\s+/).filter(Boolean);
  const changed = changedNativeWords(rewrite, nativeVersion);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <span className="section-label text-emerald-700">Native version</span>
      <p className="prose mt-2 text-lg">
        {nativeWords.map((word, index) => (
          <React.Fragment key={`${word}-${index}`}>
            {index > 0 ? ' ' : null}
            {changed.has(index) ? (
              <mark className="rounded bg-emerald-200/70 px-0.5 text-emerald-950">{word}</mark>
            ) : (
              <span>{word}</span>
            )}
          </React.Fragment>
        ))}
      </p>
      <p className="mt-2 text-xs text-emerald-700/80">Highlighted words are where the native version differs from yours.</p>
    </div>
  );
}

export function CompareView({ original, rewrite, nativeVersion, annotations }: CompareViewProps) {
  return (
    <div className="space-y-5" aria-label="rewrite comparison">
      {nativeVersion ? <NativeVersion rewrite={rewrite} nativeVersion={nativeVersion} /> : null}

      <div className="space-y-3">
        <span className="section-label">Why these changes</span>
        {annotations.map(annotation => (
          <div key={`${annotation.errorType}-${annotation.span}`} className="rounded-xl border border-stone-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-serif text-stone-900">{annotation.span}</span>
              <span className="chip">{annotation.errorType.replace(/_/g, ' ')}</span>
            </div>
            {annotation.rule ? <p className="mt-3 text-sm font-semibold text-stone-900">{annotation.rule}</p> : null}
            {annotation.explanation ? (
              <p className="mt-1 text-sm leading-6 text-stone-600">{annotation.explanation}</p>
            ) : null}
            {annotation.ruleExample ? (
              <div className="change-card mt-3">
                <div>
                  <span className="change-label">From your text</span>
                  <p>{annotation.ruleExample.before}</p>
                </div>
                <div>
                  <span className="change-label">Change to</span>
                  <p className="font-semibold text-emerald-900">{annotation.ruleExample.after}</p>
                </div>
              </div>
            ) : null}
            {annotation.bookReference ? (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-slate-600">
                <p className="section-label text-indigo-500">Book connection</p>
                <p className="mt-1 font-semibold text-indigo-800">{annotation.bookReference.source}</p>
                <p className="mt-1">{annotation.bookReference.pattern}</p>
                {annotation.bookReference.quote ? (
                  <p className="mt-1 text-slate-500">"{annotation.bookReference.quote}"</p>
                ) : (
                  <p className="mt-1 text-slate-400">{annotation.bookReference.quoteStatus}</p>
                )}
              </div>
            ) : null}
            {annotation.modelRewrite ? (
              <p className="mt-3 text-sm">
                <span className="text-stone-400">Use this move: </span>
                <span className="font-medium text-emerald-800">{annotation.modelRewrite}</span>
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 p-4">
          <span className="section-label">Your rewrite</span>
          <p className="prose mt-2 whitespace-pre-wrap text-base text-stone-700">{rewrite}</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <span className="section-label">Original</span>
          <p className="prose mt-2 whitespace-pre-wrap text-base text-stone-500">{original}</p>
        </div>
      </div>
    </div>
  );
}
