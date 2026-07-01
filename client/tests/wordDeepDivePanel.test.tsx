// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WordDeepDivePanel } from '../src/components/WordDeepDivePanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('loads word details, marks related words, shows distinctions and examples, and does not refetch after load', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      wordFamily: ['allocate', 'allocated', 'allocation'],
      nearSynonyms: [
        { word: 'assign', distinction: 'Use assign for tasks or ownership.' },
        { word: 'distribute', distinction: 'Use distribute when spreading resources across recipients.' },
      ],
      usageExamples: [
        'The team allocated more capital to infrastructure.',
        'A careful allocation can protect runway.',
        'Resources were allocated before the roadmap changed.',
      ],
      relatedInYourList: ['allocation', 'assign'],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  const { rerender } = render(<WordDeepDivePanel vocabId={12} word="allocate" />);

  expect(screen.getByText('Loading...')).toHaveClass('text-slate-400');
  expect(await screen.findByText('Word family')).toBeInTheDocument();
  expect(screen.getByText('Word family')).toHaveClass('field-label');
  expect(screen.getByText('Compare')).toBeInTheDocument();
  expect(screen.getByText('Compare')).toHaveClass('field-label');
  expect(screen.getByText('In use')).toBeInTheDocument();
  expect(screen.getByText('In use')).toHaveClass('field-label');
  expect(screen.getByText('Family map')).toBeInTheDocument();
  expect(screen.getByText('base form / headword')).toBeInTheDocument();
  expect(screen.getByText('past tense or past participle')).toBeInTheDocument();
  expect(screen.getByText('noun form')).toBeInTheDocument();
  expect(screen.getAllByText(/core meaning: same family as allocate/).length).toBeGreaterThan(0);
  expect(screen.getAllByText('allocate').some(node => node.classList.contains('chip'))).toBe(true);
  const allocationChip = screen.getAllByText('allocation').find(node => node.classList.contains('chip-blue'));
  expect(allocationChip).toBeTruthy();
  expect(allocationChip).toHaveAttribute('title', 'in your list');
  expect(screen.getAllByText('in your list')).toHaveLength(1);
  expect(screen.getByText(/Use assign for tasks or ownership./)).toBeInTheDocument();
  expect(screen.getByText(/Use distribute when spreading resources/)).toBeInTheDocument();
  expect(screen.getAllByText(/The team/).length).toBeGreaterThan(0);
  expect(document.querySelectorAll('strong')).not.toHaveLength(0);

  rerender(<WordDeepDivePanel vocabId={12} word="allocate" />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});

it('keeps loaded details cached after unmounting the expanded panel', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      wordFamily: ['reserve'],
      nearSynonyms: [],
      usageExamples: ['The team reserves capital for infrastructure.'],
      relatedInYourList: [],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  const first = render(<WordDeepDivePanel vocabId={77} word="reserve" />);
  expect(await screen.findByText('Word family')).toBeInTheDocument();
  first.unmount();

  render(<WordDeepDivePanel vocabId={77} word="reserve" />);

  expect(await screen.findByText('Word family')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('shows an error state when details cannot be loaded', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'nope' }),
  } as Response)));

  render(<WordDeepDivePanel vocabId={99} word="allocate" />);

  expect(await screen.findByText('Could not load word details.')).toHaveClass('text-red-600');
});
