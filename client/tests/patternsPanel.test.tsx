// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { addPattern, checkPatternUsage, getPatterns, reviewPattern, scanPatterns } from '../src/api';
import { PatternsPanel } from '../src/components/PatternsPanel';

vi.mock('../src/api', () => ({
  getPatterns: vi.fn(async () => ({
    items: [
      { id: 1, phrase: 'on the stage', preposition: 'on', cue: '___ the stage', timesSeen: 0, timesCorrect: 0 },
    ],
  })),
  addPattern: vi.fn(async () => ({ id: 2, phrase: 'at an event', preposition: 'at', cue: '___ an event', timesSeen: 0, timesCorrect: 0 })),
  reviewPattern: vi.fn(async (id: number, correct: boolean) => ({
    id, phrase: 'on the stage', preposition: 'on', cue: '___ the stage', timesSeen: 1, timesCorrect: correct ? 1 : 0,
  })),
  deletePattern: vi.fn(async () => undefined),
  checkPatternUsage: vi.fn(async () => ({ correct: true, feedback: 'Correct use of "on".', modelSentence: 'She stood on the stage.' })),
  scanPatterns: vi.fn(async () => ({ added: 12, total: 13 })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows a preview cue while adding and auto-detects the preposition', async () => {
  render(<PatternsPanel />);
  await waitFor(() => expect(getPatterns).toHaveBeenCalled());

  fireEvent.change(screen.getByPlaceholderText('on the stage'), { target: { value: 'play with' } });
  // Auto-detected gap -> preview shows the blanked cue and the answer.
  expect(screen.getByText('play ___')).toBeInTheDocument();
});

it('grades the fill-the-preposition drill locally and records the review', async () => {
  render(<PatternsPanel />);
  await waitFor(() => expect(getPatterns).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: /Drill/ }));
  expect(await screen.findByText('___ the stage')).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('preposition'), { target: { value: 'on' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  await waitFor(() => expect(screen.getByText('✓ Correct')).toBeInTheDocument());
  expect(reviewPattern).toHaveBeenCalledWith(1, true);
});

it('scans the vocabulary and reports how many patterns were added', async () => {
  render(<PatternsPanel />);
  await waitFor(() => expect(getPatterns).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Scan my vocab' }));

  await waitFor(() => expect(screen.getByText(/Added 12 patterns from your vocabulary/)).toBeInTheDocument());
  expect(scanPatterns).toHaveBeenCalled();
  // The list is reloaded after a scan.
  expect(getPatterns).toHaveBeenCalledTimes(2);
});

it('runs the AI usage check in the drill', async () => {
  render(<PatternsPanel />);
  await waitFor(() => expect(getPatterns).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /Drill/ }));

  const usageBox = await screen.findByPlaceholderText('Write a sentence using "on the stage"');
  fireEvent.change(usageBox, { target: { value: 'The band performed on the stage last night.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check my sentence' }));

  await waitFor(() => expect(screen.getByText('✓ Used correctly')).toBeInTheDocument());
  expect(checkPatternUsage).toHaveBeenCalledWith({
    phrase: 'on the stage',
    preposition: 'on',
    sentence: 'The band performed on the stage last night.',
  });
});
