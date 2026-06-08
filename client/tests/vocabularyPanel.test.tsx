// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VocabularyPanel } from '../src/components/VocabularyPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders a priority-sorted vocabulary list with capture and usage counts', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      total: 2,
      items: [
        {
          word: 'well worn phrase',
          kind: 'phrase',
          defCn: 'seen many times',
          captureCount: 5,
          timesSuggested: 3,
          timesUsed: 1,
          lastCaptured: '2026-05-10T00:00:00.000Z',
          capturedDate: '2026-05-10',
        },
        {
          word: 'fresh word',
          kind: 'word',
          defCn: 'newly captured',
          captureCount: 1,
          timesSuggested: 0,
          timesUsed: 0,
          lastCaptured: '2026-06-04T00:00:00.000Z',
          capturedDate: '2026-06-04',
        },
      ],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  expect(await screen.findByText('My vocabulary (2)')).toBeInTheDocument();
  expect(screen.queryByText('well worn phrase')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open vocabulary' }));

  expect(screen.getByText('well worn phrase')).toBeInTheDocument();
  expect(screen.getByText('2026-05-10')).toBeInTheDocument();
  expect(screen.getByText('seen many times')).toBeInTheDocument();
  expect(screen.getByText('met 5x')).toBeInTheDocument();
  expect(screen.getByText('used 1 / suggested 3')).toBeInTheDocument();
  expect(screen.getByText('fresh word')).toBeInTheDocument();
  expect(screen.getByText('2026-06-04')).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vocab/list?limit=30', expect.any(Object)));
});
