// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VocabPrime } from '../src/components/VocabPrime';
import { primeVocab } from '../src/api';

vi.mock('../src/api', () => ({
  primeVocab: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reuses primed vocab for the same prompt and refresh key', async () => {
  vi.mocked(primeVocab).mockResolvedValue({
    topic: 'AI infrastructure',
    vocab: [
      {
        word: 'margin pressure',
        normalized: 'margin pressure',
        kind: 'phrase',
        defCn: '利润率压力',
        timesSuggested: 0,
        timesUsed: 0,
      },
      {
        word: 'discern',
        normalized: 'discern',
        kind: 'word',
        defCn: '辨别',
        timesSuggested: 0,
        timesUsed: 0,
      },
    ],
  });
  const onVocabChange = vi.fn();

  const first = render(<VocabPrime promptText="AI infrastructure spending" refreshKey={0} onVocabChange={onVocabChange} />);
  expect(await screen.findByText('margin pressure')).toBeInTheDocument();
  expect(screen.getByText('Chunks / fixed combos')).toBeInTheDocument();
  expect(screen.getByText('Single words')).toBeInTheDocument();
  expect(screen.getByText('discern')).toBeInTheDocument();
  first.unmount();

  render(<VocabPrime promptText="AI infrastructure spending" refreshKey={0} onVocabChange={onVocabChange} />);

  expect(await screen.findByText('margin pressure')).toBeInTheDocument();
  await waitFor(() => {
    expect(primeVocab).toHaveBeenCalledTimes(1);
  });
});
