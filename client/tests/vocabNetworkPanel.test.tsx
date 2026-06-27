// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { VocabListItem } from '../../shared/types';
import { buildClusters, VocabNetworkPanel } from '../src/components/VocabNetworkPanel';

afterEach(() => {
  cleanup();
});

function item(word: string, nearSynonyms: VocabListItem['nearSynonyms'] = []): VocabListItem {
  return {
    id: word.length,
    word,
    kind: 'word',
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
    nearSynonyms,
  };
}

it('builds one cluster from overlapping near-synonyms in the user list', () => {
  expect(buildClusters([
    item('allocate', [{ word: 'assign', distinction: 'Use assign for ownership.' }]),
    item('assign', [{ word: 'distribute', distinction: 'Use distribute for broad spreading.' }]),
    item('distribute'),
  ])).toEqual([['allocate', 'assign', 'distribute']]);
});

it('excludes near-synonyms that are not saved vocab items', () => {
  expect(buildClusters([
    item('allocate', [
      { word: 'assign', distinction: 'Use assign for ownership.' },
      { word: 'apportion', distinction: 'Use apportion for dividing shares.' },
    ]),
    item('assign'),
  ])).toEqual([['allocate', 'assign']]);
});

it('renders nothing when no semantic clusters exist', () => {
  const { container } = render(
    <VocabNetworkPanel items={[
      item('allocate', [{ word: 'apportion', distinction: 'Use apportion for dividing shares.' }]),
    ]} />,
  );

  expect(container).toBeEmptyDOMElement();
});

it('renders semantic cluster chips', () => {
  render(
    <VocabNetworkPanel items={[
      item('allocate', [{ word: 'assign', distinction: 'Use assign for ownership.' }]),
      item('assign'),
    ]} />,
  );

  expect(screen.getByText('Semantic connections')).toBeInTheDocument();
  expect(screen.getByText('allocate')).toBeInTheDocument();
  expect(screen.getByText('assign')).toBeInTheDocument();
});
