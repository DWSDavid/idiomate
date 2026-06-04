// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { captureWord, saveVocab } from '../src/api';
import { CaptureWord } from '../src/components/CaptureWord';

vi.mock('../src/api', () => ({
  captureWord: vi.fn(async () => ({
    word: 'shore up',
    kind: 'phrase',
    defCn: 'support',
    examples: ['They moved to shore up confidence.'],
    collocations: ['shore up margins'],
    register: 'business',
    source: 'capture',
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
  })),
  saveVocab: vi.fn(async () => ({ id: 9 })),
}));

it('captures a word, lets the user edit enrichment, and saves it', async () => {
  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.change(screen.getByLabelText('Where you saw it (optional)'), {
    target: { value: 'We need to shore up margins.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Definition'), { target: { value: 'strengthen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  await waitFor(() => {
    expect(saveVocab).toHaveBeenCalledWith(expect.objectContaining({
      word: 'shore up',
      defCn: 'strengthen',
    }));
  });
  expect(captureWord).toHaveBeenCalledWith('shore up', 'We need to shore up margins.');
});
