// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReviewPanel } from '../src/components/ReviewPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reveals cards, records review outcomes, advances, and can go write', async () => {
  const onGoWrite = vi.fn();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/vocab/review-queue')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: [
            {
              id: 1,
              word: 'allocate',
              kind: 'word',
              pos: 'verb',
              defCn: 'allocate resources',
              examples: ['We allocated capital carefully.', 'The team allocates time weekly.', 'Hidden third example.'],
              collocations: ['allocate capital', 'allocate resources', 'hidden third collocation'],
              timesSuggested: 0,
              timesUsed: 0,
            },
            {
              id: 2,
              word: 'runway',
              kind: 'word',
              pos: 'noun',
              defCn: 'time before cash runs out',
              examples: ['The startup has twelve months of runway.'],
              collocations: ['extend runway'],
              timesSuggested: 0,
              timesUsed: 0,
            },
          ],
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/') && url.includes('/review')) {
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ReviewPanel onGoWrite={onGoWrite} />);

  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(screen.getByText('allocate')).toBeInTheDocument();
  expect(screen.getByText('verb')).toBeInTheDocument();
  expect(screen.getByText('word')).toBeInTheDocument();
  expect(screen.queryByText('allocate resources')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

  expect(screen.getByText('allocate resources')).toBeInTheDocument();
  expect(screen.getByText('We allocated capital carefully.')).toBeInTheDocument();
  expect(screen.getByText('The team allocates time weekly.')).toBeInTheDocument();
  expect(screen.queryByText('Hidden third example.')).not.toBeInTheDocument();
  expect(screen.getByText('allocate capital')).toBeInTheDocument();
  expect(screen.getByText('allocate resources')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/vocab/1/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ease: 'easy' }),
    }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Again' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/vocab/2/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ease: 'hard' }),
    }));
    expect(screen.getByText('You knew 1 of 2.')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Go write' }));
  expect(onGoWrite).toHaveBeenCalledTimes(1);
});

it('shows the SM-2 empty state when no words are due', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ items: [] }),
  } as Response)));

  render(<ReviewPanel onGoWrite={() => undefined} />);

  expect(await screen.findByText(/no words due/i)).toBeInTheDocument();
});
