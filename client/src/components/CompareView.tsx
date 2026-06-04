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
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-900">Native Version</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-950">
        {nativeWords.map((word, index) => (
          <React.Fragment key={`${word}-${index}`}>
            {index > 0 ? ' ' : null}
            {changed.has(index) ? (
              <mark className="rounded bg-amber-200 px-1 text-zinc-950">{word}</mark>
            ) : (
              <span>{word}</span>
            )}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

export function CompareView({ original, rewrite, nativeVersion, annotations }: CompareViewProps) {
  return (
    <section className="space-y-5" aria-label="rewrite comparison">
      {nativeVersion ? <NativeVersion rewrite={rewrite} nativeVersion={nativeVersion} /> : null}

      <div className="space-y-3">
        {annotations.map(annotation => (
          <article key={`${annotation.errorType}-${annotation.span}`} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-zinc-900">{annotation.span}</span>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {annotation.errorType}
              </span>
            </div>
            {annotation.rule ? (
              <p className="mt-3 text-sm font-semibold text-zinc-900">{annotation.rule}</p>
            ) : null}
            <p className="mt-3 text-sm leading-6 text-zinc-700">{annotation.explanation}</p>
            {annotation.ruleExample ? (
              <p className="mt-2 text-sm text-zinc-600">
                <span className="line-through">{annotation.ruleExample.before}</span>
                <span> → </span>
                <span className="font-medium text-zinc-900">{annotation.ruleExample.after}</span>
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium text-emerald-800">{annotation.modelRewrite}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-700">Your Rewrite</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">{rewrite}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-700">Original</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-900">{original}</p>
        </div>
      </div>
    </section>
  );
}
