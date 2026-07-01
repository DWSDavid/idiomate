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
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal('speechSynthesis', { cancel, speak });
  vi.stubGlobal('SpeechSynthesisUtterance', vi.fn(function SpeechSynthesisUtterance(this: { text: string }, text: string) {
    this.text = text;
  }));
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      total: 2,
      items: [
        {
          id: 1,
          word: 'well worn phrase',
          kind: 'phrase',
          defCn: 'seen many times',
          source: 'website_reading',
          sourceTitle: 'Markets digest: AI capex cycle',
          sourceUrl: 'https://example.com/markets',
          examples: ['The phrase helps describe pressure from repeated market narratives.'],
          captureCount: 5,
          timesSuggested: 3,
          timesUsed: 1,
          lastCaptured: '2026-05-10T00:00:00.000Z',
          capturedDate: '2026-05-10',
        },
        {
          id: 2,
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
  expect(await screen.findByText('well worn phrase')).toBeInTheDocument();
  expect(screen.getByText('2026-05-10')).toBeInTheDocument();
  expect(screen.getByText('seen 5 total')).toBeInTheDocument();
  expect(screen.getByText('Context example')).toBeInTheDocument();
  expect(screen.getByText('The phrase helps describe pressure from repeated market narratives.')).toBeInTheDocument();
  expect(screen.getByText('Origin')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Markets digest: AI capex cycle' })).toHaveAttribute('href', 'https://example.com/markets');
  fireEvent.click(screen.getByRole('button', { name: 'Play pronunciation for well worn phrase' }));
  expect(cancel).toHaveBeenCalled();
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'well worn phrase', lang: 'en-US' }));
  // definition hidden until word is clicked — hint text confirms behaviour
  expect(screen.getAllByText('tap word to reveal').length).toBeGreaterThan(0);
  expect(screen.getByText('used 1 / suggested 3')).toBeInTheDocument();
  expect(screen.getByText('fresh word')).toBeInTheDocument();
  expect(screen.getByText('2026-06-04')).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vocab/list?limit=30', expect.any(Object)));
});

it('opens one deep-dive panel under the selected vocabulary row', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 2,
          items: [
            {
              id: 1,
              word: 'allocate',
              kind: 'word',
              defCn: 'allocate resources',
              captureCount: 2,
              timesSuggested: 0,
              timesUsed: 0,
              lastCaptured: '2026-06-04T00:00:00.000Z',
              capturedDate: '2026-06-04',
            },
            {
              id: 2,
              word: 'runway',
              kind: 'word',
              defCn: 'time before cash runs out',
              captureCount: 1,
              timesSuggested: 0,
              timesUsed: 0,
              lastCaptured: '2026-06-04T00:00:00.000Z',
              capturedDate: '2026-06-04',
            },
          ],
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/1/deep-dive')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          wordFamily: ['allocate', 'allocation'],
          nearSynonyms: [],
          usageExamples: ['The team allocated more capital.'],
          relatedInYourList: ['allocation'],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Details' }))[0]);

  expect(await screen.findByText('Word family')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/vocab/1/deep-dive', expect.any(Object));

  // after expanding item 1, its button shows "Close"; only item 2's Details button remains
  fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);

  expect(screen.queryByText('Word family')).not.toBeInTheDocument();
});

it('opens all vocabulary in a floating window without replacing the top list', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/all')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 51,
          items: [
            {
              id: 50,
              word: 'newest browse word',
              kind: 'word',
              defCn: 'shown in modal',
              captureCount: 1,
              timesSuggested: 0,
              timesUsed: 0,
              dateAdded: '2026-06-30T00:00:00.000Z',
            },
          ],
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 51,
          items: [
            {
              id: 1,
              word: 'top priority word',
              kind: 'word',
              defCn: 'shown in main panel',
              captureCount: 3,
              timesSuggested: 0,
              timesUsed: 0,
              lastCaptured: '2026-06-29T00:00:00.000Z',
              capturedDate: '2026-06-29',
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  expect(await screen.findByText('top priority word')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Browse all' }));

  expect(await screen.findByRole('dialog', { name: 'all vocabulary' })).toBeInTheDocument();
  const overlay = screen.getByTestId('vocab-browser-overlay');
  expect(overlay.parentElement).toBe(document.body);
  expect(overlay).toHaveClass('vocab-browse-overlay');
  expect(screen.getByRole('dialog', { name: 'all vocabulary' })).toHaveClass('vocab-browse-shell');
  expect(screen.getByText('All vocabulary (51)')).toBeInTheDocument();
  expect(screen.getByText('51 total words across every source, newest first.')).toBeInTheDocument();
  expect(screen.getByText('newest browse word')).toBeInTheDocument();
  expect(screen.getByText('1-50 of 51')).toBeInTheDocument();
  expect(screen.getByText('My vocabulary (51)')).toBeInTheDocument();
  expect(screen.getByText('top priority word')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/vocab/all?offset=0&limit=50&sort=date', expect.any(Object));
});

it('opens website vocabulary in a centered whole-page floating window', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/all')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          items: [
            {
              id: 7,
              word: 'enchants',
              kind: 'word',
              defCn: 'attracts or delights',
              source: 'website_reading',
              sourceTitle: 'Culture desk',
              sourceUrl: 'https://example.com/culture',
              examples: ['The image enchants readers before the headline lands.'],
              captureCount: 2,
              timesSuggested: 0,
              timesUsed: 0,
              dateAdded: '2026-06-30T00:00:00.000Z',
            },
          ],
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          items: [
            {
              id: 7,
              word: 'enchants',
              kind: 'word',
              captureCount: 2,
              timesSuggested: 0,
              timesUsed: 0,
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  fireEvent.click(await screen.findByRole('button', { name: 'Website vocab' }));

  expect(await screen.findByRole('dialog', { name: 'website vocabulary' })).toBeInTheDocument();
  expect(screen.getByText('Website vocabulary (1)')).toBeInTheDocument();
  expect(screen.getByText('1 webpage-sourced word is still counted inside My vocabulary. This is only a filtered source view.')).toBeInTheDocument();
  expect(screen.getByText('My vocabulary (1)')).toBeInTheDocument();
  expect(screen.getByText('The image enchants readers before the headline lands.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Culture desk' })).toHaveAttribute('href', 'https://example.com/culture');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/vocab/all?offset=0&limit=50&sort=date&source=website_reading',
    expect.any(Object),
  );
});

it('closes the vocabulary browser with Escape', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/all')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 0,
          items: [],
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          items: [
            {
              id: 7,
              word: 'sourceful',
              kind: 'word',
              captureCount: 1,
              timesSuggested: 0,
              timesUsed: 0,
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  fireEvent.click(await screen.findByRole('button', { name: 'Website vocab' }));
  expect(await screen.findByRole('dialog', { name: 'website vocabulary' })).toBeInTheDocument();

  fireEvent.keyDown(globalThis, { key: 'Escape' });

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'website vocabulary' })).not.toBeInTheDocument();
  });
});

it('merges families from the vocabulary panel and reloads the list', async () => {
  let listCalls = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/merge-families')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ merged: 1 }),
      } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      listCalls += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          items: [
            {
              id: 1,
              word: 'fortune',
              kind: 'word',
              defCn: 'luck or wealth',
              captureCount: listCalls === 1 ? 2 : 5,
              timesSuggested: 0,
              timesUsed: 0,
              lastCaptured: '2026-06-05T00:00:00.000Z',
              capturedDate: '2026-06-05',
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  fireEvent.click(await screen.findByRole('button', { name: 'Merge families' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/vocab/merge-families', expect.objectContaining({ method: 'POST' }));
    expect(listCalls).toBe(2);
  });
});

it('reloads the vocabulary list without a page refresh', async () => {
  let listCalls = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/list')) {
      listCalls += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          total: 1,
          items: [
            {
              id: listCalls === 1 ? 1 : 2,
              word: listCalls === 1 ? 'old word' : 'extension word',
              kind: 'word',
              captureCount: 1,
              timesSuggested: 0,
              timesUsed: 0,
            },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VocabularyPanel />);

  expect(await screen.findByText('old word')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  expect(await screen.findByText('extension word')).toBeInTheDocument();
  expect(listCalls).toBe(2);
});
