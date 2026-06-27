// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TodayStrip } from '../src/components/TodayStrip';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders today vocab chips and a compact overflow count', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: 1, word: 'alpha', timesSuggested: 0, timesUsed: 0 },
        { id: 2, word: 'beta', timesSuggested: 0, timesUsed: 0 },
        { id: 3, word: 'gamma', timesSuggested: 0, timesUsed: 0 },
        { id: 4, word: 'delta', timesSuggested: 0, timesUsed: 0 },
        { id: 5, word: 'epsilon', timesSuggested: 0, timesUsed: 0 },
        { id: 6, word: 'zeta', timesSuggested: 0, timesUsed: 0 },
      ],
    }),
  } as Response)));

  render(<TodayStrip />);

  expect(await screen.findByText('Today')).toBeInTheDocument();
  expect(screen.getByText('alpha')).toHaveClass('chip-blue');
  expect(screen.getByText('epsilon')).toBeInTheDocument();
  expect(screen.queryByText('zeta')).not.toBeInTheDocument();
  expect(screen.getByText('+1 more')).not.toHaveClass('chip');
});

it('clicking a word chip reveals defCn + pos; clicking again hides it; clicking another swaps', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      items: [
        { id: 1, word: 'allocate', pos: 'verb', defCn: '分配', timesSuggested: 0, timesUsed: 0 },
        { id: 2, word: 'runway', pos: 'noun', defCn: '现金跑道', timesSuggested: 0, timesUsed: 0 },
      ],
    }),
  } as Response)));

  render(<TodayStrip />);
  await screen.findByText('allocate');

  // def hidden initially
  expect(screen.queryByText('分配')).not.toBeInTheDocument();

  // click to reveal
  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  expect(await screen.findByText('分配')).toBeInTheDocument();
  expect(screen.getByText('verb')).toBeInTheDocument();

  // click again to hide
  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  await waitFor(() => expect(screen.queryByText('分配')).not.toBeInTheDocument());

  // clicking runway closes allocate and shows runway def
  fireEvent.click(screen.getByRole('button', { name: 'allocate' }));
  await screen.findByText('分配');
  fireEvent.click(screen.getByRole('button', { name: 'runway' }));
  await waitFor(() => expect(screen.queryByText('分配')).not.toBeInTheDocument());
  expect(screen.getByText('现金跑道')).toBeInTheDocument();
});

it('renders nothing when there are no captures today', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [] }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  const { container } = render(<TodayStrip />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
