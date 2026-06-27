// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GraduatedShelf } from '../src/components/GraduatedShelf';
import * as api from '../src/api';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

vi.mock('../src/api', () => ({
  getGraduatedVocab: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(api.getGraduatedVocab).mockResolvedValue({
    items: [
      { id: 1, word: 'leverage', kind: 'word', captureCount: 3, timesSuggested: 1, timesUsed: 1, defCn: '利用' },
      { id: 2, word: 'moat', kind: 'word', captureCount: 2, timesSuggested: 0, timesUsed: 1, defCn: '护城河' },
    ],
  });
});

it('renders mastered words', async () => {
  render(<GraduatedShelf />);
  await screen.findByText('leverage');
  expect(screen.getByText('moat')).toBeTruthy();
});

it('shows empty state when no graduated words', async () => {
  vi.mocked(api.getGraduatedVocab).mockResolvedValue({ items: [] });
  render(<GraduatedShelf />);
  await screen.findByText(/no mastered words/i);
});

it('shows defCn for each word', async () => {
  render(<GraduatedShelf />);
  await screen.findByText('利用');
  expect(screen.getByText('护城河')).toBeTruthy();
});
