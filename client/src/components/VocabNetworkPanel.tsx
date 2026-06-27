import React from 'react';
import type { VocabListItem } from '../../../shared/types';

function normalizeWord(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildClusters(items: VocabListItem[]): string[][] {
  const displayByKey = new Map<string, string>();
  const orderByKey = new Map<string, number>();
  const parent = new Map<string, string>();

  items.forEach((item, index) => {
    const key = normalizeWord(item.word);
    displayByKey.set(key, item.word);
    orderByKey.set(key, index);
    parent.set(key, key);
  });

  const find = (key: string): string => {
    const current = parent.get(key);
    if (!current || current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    const orderA = orderByKey.get(rootA) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderByKey.get(rootB) ?? Number.MAX_SAFE_INTEGER;
    if (orderA <= orderB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootA, rootB);
    }
  };

  for (const item of items) {
    const sourceKey = normalizeWord(item.word);
    for (const synonym of item.nearSynonyms ?? []) {
      const synonymKey = normalizeWord(synonym.word);
      if (displayByKey.has(synonymKey)) union(sourceKey, synonymKey);
    }
  }

  const grouped = new Map<string, string[]>();
  for (const key of displayByKey.keys()) {
    const root = find(key);
    grouped.set(root, [...(grouped.get(root) ?? []), key]);
  }

  return Array.from(grouped.values())
    .filter(cluster => cluster.length > 1)
    .map(cluster => cluster
      .sort((a, b) => (orderByKey.get(a) ?? 0) - (orderByKey.get(b) ?? 0))
      .map(key => displayByKey.get(key) ?? key));
}

interface VocabNetworkPanelProps {
  items: VocabListItem[];
}

export function VocabNetworkPanel({ items }: VocabNetworkPanelProps) {
  const clusters = buildClusters(items);
  if (!clusters.length) return null;

  return (
    <section className="mt-5 border-t border-slate-100 pt-4" aria-label="semantic connections">
      <span className="section-label">Semantic connections</span>
      <div className="mt-3 space-y-2">
        {clusters.map(cluster => (
          <div key={cluster.join('|')} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50/80 p-3">
            {cluster.map((word, index) => (
              <React.Fragment key={word}>
                {index > 0 ? <span className="text-xs font-semibold text-slate-300">~</span> : null}
                <span className="chip chip-slate">{word}</span>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
