// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  expect(screen.getByText('+1 more')).toBeInTheDocument();
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
