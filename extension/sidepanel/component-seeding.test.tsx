// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { captureWord, getWordDeepDive, saveVocab } from '../../client/src/api';
import { CaptureWord } from '../../client/src/components/CaptureWord';
import { SentenceLab } from '../../client/src/components/SentenceLab';

vi.mock('../../client/src/api', () => ({
  askFollowUp: vi.fn(),
  captureWord: vi.fn(),
  diagnoseSentenceLab: vi.fn(),
  getWordDeepDive: vi.fn(),
  revealSentenceLabResult: vi.fn(),
  saveVocab: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('seeds CaptureWord from an initial word and context sentence', () => {
  render(
    <CaptureWord
      initialWord="margin pressure"
      initialContextSentence="From AI agents move into finance workflows: margin pressure"
      captureSource="website_reading"
      onSaved={() => {}}
    />,
  );

  expect(screen.getByDisplayValue('margin pressure')).toBeInTheDocument();
  expect(screen.getByDisplayValue('From AI agents move into finance workflows: margin pressure')).toBeInTheDocument();
});

it('preserves website_reading source when saving a seeded capture', async () => {
  vi.mocked(captureWord).mockResolvedValue({
    word: 'margin pressure',
    source: 'manual',
    contextSentence: 'margin pressure',
    defCn: 'pressure on profit margins',
    timesSuggested: 0,
    timesUsed: 0,
  });
  vi.mocked(saveVocab).mockResolvedValue({ id: 7, captureCount: 1, existed: false });
  vi.mocked(getWordDeepDive).mockResolvedValue({
    wordFamily: [],
    nearSynonyms: [],
    usageExamples: [],
    relatedInYourList: [],
  });

  render(
    <CaptureWord
      initialWord="margin pressure"
      initialContextSentence="From AI agents move into finance workflows: margin pressure"
      captureSource="website_reading"
      onSaved={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Enrich' }));

  await waitFor(() => {
    expect(captureWord).toHaveBeenCalledWith(
      'margin pressure',
      'From AI agents move into finance workflows: margin pressure',
    );
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Save to my words' }));

  await waitFor(() => {
    expect(saveVocab).toHaveBeenCalledWith(expect.objectContaining({
      contextSentence: 'From AI agents move into finance workflows: margin pressure',
      source: 'website_reading',
      word: 'margin pressure',
    }));
  });
});

it('seeds SentenceLab from an initial sentence', () => {
  render(<SentenceLab initialSentence="We made the implementation yesterday." />);

  expect(screen.getByLabelText('Sentence to check')).toHaveValue('We made the implementation yesterday.');
});
