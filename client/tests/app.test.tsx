// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders a tabbed workspace with prompt and draft visible in the same workbench', async () => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/prompt/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ date: '2026-06-04', theme: 'tech', text: 'Write one paragraph.' }) } as Response);
    }
    if (url.includes('/api/vocab/prime')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topic: 'tech', vocab: [] }) } as Response);
    }
    if (url.includes('/api/vocab/review-queue')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/vocab/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [{ id: 1, word: 'today word', timesSuggested: 0, timesUsed: 0 }] }) } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 0, items: [] }) } as Response);
    }
    if (url.includes('/api/memory/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topWeaknesses: [], totalSessions: 0, sessionEmbeddingsCount: 0, vocabCount: 0, vocabByEase: { new: 0, hard: 0, easy: 0 } }) } as Response);
    }
    if (url.includes('/api/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) } as Response);
    }
    if (url.includes('/api/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ tallies: [], activation: { suggested: 0, used: 0 } }) } as Response);
    }
    if (url.includes('/api/progress')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ daily: [], trend: [] }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }));

  render(<App />);

  expect(await screen.findByRole('banner', { name: 'Writing desk header' })).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Workspace sections' });
  expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Write', 'Words', 'Review', 'Me']);
  expect(within(nav).getByRole('button', { name: 'Write' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(nav).queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument();
  expect(within(nav).queryByRole('button', { name: 'Sentence Lab' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('writing canvas')).toBeInTheDocument();
  expect(screen.getByLabelText('writing reference rail')).toBeInTheDocument();
  expect(screen.getByLabelText('draft workbench')).toBeInTheDocument();
  expect(await screen.findByText(/Today's prompt/)).toBeInTheDocument();
  expect(await screen.findByText('today word')).toBeInTheDocument();
  expect(screen.getByText('Words to work in')).toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toBeInTheDocument();
  expect(screen.queryByLabelText('sentence lab page')).not.toBeInTheDocument();

  fireEvent.click(within(nav).getByRole('button', { name: 'Words' }));

  expect(screen.getByText('Add a word you met today')).toBeInTheDocument();
  expect(screen.getByText('My vocabulary (0)')).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole('button', { name: 'Review' }));

  expect(await screen.findByText('Capture some words first - they will appear here for review.')).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole('button', { name: 'Me' }));

  expect(screen.getByText('Your patterns')).toBeInTheDocument();
  expect(screen.getByText('Progress')).toBeInTheDocument();
  expect(screen.getByText('What I know about you')).toBeInTheDocument();
  expect(screen.getByText('Writing history')).toBeInTheDocument();
});

it('records a paragraph result and refetches the profile after rewrite submit', async () => {
  let profileCalls = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/prompt/today')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 4,
          date: '2026-06-05',
          theme: 'finance',
          text: 'Write one paragraph.',
        }),
      } as Response);
    }
    if (url.includes('/api/vocab/prime')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topic: 'finance', vocab: [] }) } as Response);
    }
    if (url.includes('/api/vocab/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/memory/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topWeaknesses: [], totalSessions: 0, sessionEmbeddingsCount: 0, vocabCount: 0, vocabByEase: { new: 0, hard: 0, easy: 0 } }) } as Response);
    }
    if (url.includes('/api/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 0, items: [] }) } as Response);
    }
    if (url.includes('/api/profile')) {
      profileCalls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ tallies: [], activation: { suggested: 0, used: 0 } }) } as Response);
    }
    if (url.includes('/api/progress')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ daily: [], trend: [] }) } as Response);
    }
    if (url.includes('/api/coach')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paragraphIndex: 0,
          nativeVersion: 'We need to shore up margins to calm investors.',
          annotations: [{
            span: 'in order to',
            errorType: 'redundancy',
            hint: 'Use fewer words.',
            explanation: 'Redundancy.',
            modelRewrite: 'to',
          }],
        }),
      } as Response);
    }
    if (url.includes('/api/paragraph-result')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 10 }) } as Response);
    }
    if (url.includes('/api/coach-history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 11 }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  fireEvent.change(await screen.findByLabelText('Draft'), {
    target: { value: 'We need support margins in order to calm investors.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Coach$/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/coach-history', expect.objectContaining({ method: 'POST' }));
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox', { name: '' }), {
    target: { value: 'We need to shore up margins to calm investors.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/paragraph-result', expect.objectContaining({ method: 'POST' }));
  });

  fireEvent.click(screen.getByRole('button', { name: 'Me' }));

  await waitFor(() => {
    expect(profileCalls).toBeGreaterThanOrEqual(1);
  });
});

it('shows the access gate after a 401 and retries after saving the code', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.includes('/api/') && headers.get('x-access-code') !== 'share-code') {
      return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Access code required.' }) } as Response);
    }
    if (url.includes('/api/prompt/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ date: '2026-06-04', theme: 'tech', text: 'Write one paragraph.' }) } as Response);
    }
    if (url.includes('/api/vocab/prime')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topic: 'tech', vocab: [] }) } as Response);
    }
    if (url.includes('/api/vocab/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/vocab/list')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 0, items: [] }) } as Response);
    }
    if (url.includes('/api/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ tallies: [], activation: { suggested: 0, used: 0 } }) } as Response);
    }
    if (url.includes('/api/progress')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ daily: [], trend: [] }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  fireEvent.change(await screen.findByLabelText('Access code'), {
    target: { value: 'share-code' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(await screen.findByRole('banner', { name: 'Writing desk header' })).toBeInTheDocument();
  expect(await screen.findByText(/Today's prompt/)).toBeInTheDocument();
});
