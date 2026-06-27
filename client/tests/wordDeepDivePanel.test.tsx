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

  expect(screen.getByText('Loading...')).toBeInTheDocument();
  expect(await screen.findByText('Word family')).toBeInTheDocument();
  expect(screen.getByText('Compare')).toBeInTheDocument();
  expect(screen.getByText('In use')).toBeInTheDocument();
  expect(screen.getByText('allocate')).toHaveClass('chip');
  expect(screen.getByText('allocation')).toHaveClass('chip-blue');
  expect(screen.getAllByText('in your list')).toHaveLength(1);
  expect(screen.getByText(/Use assign for tasks or ownership./)).toBeInTheDocument();
  expect(screen.getByText(/Use distribute when spreading resources/)).toBeInTheDocument();
  expect(screen.getByText(/The team/)).toBeInTheDocument();
  expect(document.querySelectorAll('strong')).not.toHaveLength(0);

  rerender(<WordDeepDivePanel vocabId={12} word="allocate" />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});

it('shows an error state when details cannot be loaded', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'nope' }),
  } as Response)));

  render(<WordDeepDivePanel vocabId={12} word="allocate" />);

  expect(await screen.findByText('Could not load word details.')).toBeInTheDocument();
});
