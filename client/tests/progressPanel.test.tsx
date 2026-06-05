// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressPanel } from '../src/components/ProgressPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders daily mistake counts and top-type trend points', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      daily: [
        { date: '2026-06-03', count: 2 },
        { date: '2026-06-04', count: 1 },
      ],
      trend: [
        {
          errorType: 'redundancy',
          points: [
            { date: '2026-06-03', count: 1 },
            { date: '2026-06-04', count: 1 },
          ],
        },
        {
          errorType: 'word_choice',
          points: [
            { date: '2026-06-03', count: 1 },
          ],
        },
      ],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  render(<ProgressPanel />);

  expect(await screen.findByText('Progress')).toBeInTheDocument();
  expect(screen.getByText('Daily mistakes')).toBeInTheDocument();
  expect(screen.getByText('2026-06-03')).toBeInTheDocument();
  expect(screen.getByText('2 issues')).toBeInTheDocument();
  expect(screen.getByText('redundancy')).toBeInTheDocument();
  expect(screen.getByText('2026-06-04: 1')).toBeInTheDocument();
  expect(screen.getByText('word choice')).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/progress'));
});
