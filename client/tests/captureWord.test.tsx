// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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
  saveVocab: vi.fn(async () => ({ id: 9, captureCount: 1, existed: false })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

it('links the captured headword to Merriam-Webster and Cambridge lookups', async () => {
  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Merriam-Webster' })).toHaveAttribute(
    'href',
    'https://www.merriam-webster.com/dictionary/shore%20up',
  );
  expect(screen.getByRole('link', { name: 'Cambridge' })).toHaveAttribute(
    'href',
    'https://dictionary.cambridge.org/dictionary/english/shore%20up',
  );
});

it('shows a priority-raised note when saving an existing word', async () => {
  vi.mocked(saveVocab).mockResolvedValueOnce({ id: 9, captureCount: 2, existed: true });

  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  expect(await screen.findByText('Already in your list - met 2 times, priority raised.')).toBeInTheDocument();
});
