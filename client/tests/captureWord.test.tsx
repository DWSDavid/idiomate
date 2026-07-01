// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { captureWord, getWordDeepDive, saveVocab } from '../src/api';
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
  getWordDeepDive: vi.fn(async () => ({
    wordFamily: ['shore up', 'shoring up'],
    nearSynonyms: [
      { word: 'strengthen', distinction: 'Use strengthen for a direct improvement in condition.' },
    ],
    usageExamples: ['They moved quickly to shore up confidence.'],
    usageExamplesRich: [
      { sentence: 'They moved quickly to shore up confidence.', role: 'business phrase' },
    ],
    relatedInYourList: [],
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('captures a word, lets the user edit enrichment, and saves it', async () => {
  render(
    <CaptureWord
      onSaved={() => {}}
      captureSource="website_reading"
      captureSourceTitle="AI agents move into finance workflows"
      captureSourceUrl="https://example.com/ai-agents"
    />,
  );

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.change(screen.getByLabelText('Where you saw it (optional)'), {
    target: { value: 'We need to shore up margins.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  expect(screen.getByLabelText('Family base')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Definition'), { target: { value: 'strengthen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  await waitFor(() => {
    expect(saveVocab).toHaveBeenCalledWith(expect.objectContaining({
      word: 'shore up',
      defCn: 'strengthen',
      source: 'website_reading',
      sourceTitle: 'AI agents move into finance workflows',
      sourceUrl: 'https://example.com/ai-agents',
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
  vi.mocked(saveVocab).mockResolvedValueOnce({
    id: 9,
    captureCount: 2,
    previousCaptureCount: 1,
    captureDelta: 1,
    existed: true,
    canonicalWord: 'shore up',
    normalized: 'shore up',
    baseForm: 'shore up',
  });

  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  expect(await screen.findByText('Logged once more. Total seen: 2, previously 1.')).toBeInTheDocument();
});

it('shows when an inflected capture is saved under its base form', async () => {
  vi.mocked(captureWord).mockResolvedValueOnce({
    word: 'discerning',
    normalized: 'discerning',
    baseForm: 'discern',
    kind: 'word',
    defCn: '识别；辨别',
    examples: ['A discerning investor can spot weak signals.'],
    collocations: [],
    timesSuggested: 0,
    timesUsed: 0,
  });
  vi.mocked(saveVocab).mockResolvedValueOnce({
    id: 10,
    captureCount: 1,
    existed: false,
    canonicalWord: 'discern',
    normalized: 'discern',
    baseForm: 'discern',
  });

  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'discerning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('discern')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  expect(await screen.findByText('Saved under base form "discern" so this word family stays together.')).toBeInTheDocument();
});

it('shows word intelligence after saving a captured word', async () => {
  render(<CaptureWord onSaved={() => {}} />);

  fireEvent.change(screen.getByLabelText('Word or phrase'), { target: { value: 'shore up' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  expect(await screen.findByDisplayValue('support')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save to my words' }));

  await waitFor(() => expect(getWordDeepDive).toHaveBeenCalledWith(9));
  expect(await screen.findByText('business phrase')).toBeInTheDocument();
  expect(screen.getByText('strengthen')).toBeInTheDocument();
});
