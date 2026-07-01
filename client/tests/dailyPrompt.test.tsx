// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DailyPrompt } from '../src/components/DailyPrompt';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows "For context" headlines when newsItems are returned', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      date: '2026-06-27',
      theme: 'tech',
      text: 'Do you think AI will replace junior engineers?',
      newsItems: [
        { title: 'AI coding tools hit record adoption', link: 'https://example.com/1', source: 'TechCrunch' },
        { title: 'Junior devs push back on automation', link: 'https://example.com/2', source: 'The Verge' },
      ],
    }),
  } as Response)));

  render(<DailyPrompt onPrompt={() => {}} />);

  expect(await screen.findByText('For context')).toBeInTheDocument();
  expect(screen.getByText('AI coding tools hit record adoption')).toBeInTheDocument();
  expect(screen.getByText('TechCrunch')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'AI coding tools hit record adoption' }))
    .toHaveAttribute('href', 'https://example.com/1');
});

it('hides "For context" when newsItems is empty', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      date: '2026-06-27',
      theme: 'tech',
      text: 'Do you think AI will replace junior engineers?',
      newsItems: [],
    }),
  } as Response)));

  render(<DailyPrompt onPrompt={() => {}} />);
  await screen.findByText('Do you think AI will replace junior engineers?');
  expect(screen.queryByText('For context')).not.toBeInTheDocument();
});

it('hides "For context" when newsItems is absent', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      date: '2026-06-27',
      theme: 'tech',
      text: 'Describe a time when you had to explain a technical idea to a non-technical manager.',
    }),
  } as Response)));

  render(<DailyPrompt onPrompt={() => {}} />);
  await screen.findByText('Describe a time when you had to explain a technical idea to a non-technical manager.');
  expect(screen.queryByText('For context')).not.toBeInTheDocument();
});

it('saves generated prompts and lets the writer return to a saved topic', async () => {
  const onPrompt = vi.fn();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/prompt/today')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 4,
          date: '2026-07-01',
          theme: 'consumer technology',
          text: 'Would you pay more for a device that protects your attention?',
          saved: false,
          newsItems: [],
        }),
      } as Response);
    }
    if (url.includes('/api/prompt/4/save')) {
      expect(init?.method).toBe('POST');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 4,
          date: '2026-07-01',
          theme: 'consumer technology',
          text: 'Would you pay more for a device that protects your attention?',
          saved: true,
        }),
      } as Response);
    }
    if (url.includes('/api/prompt/4/use')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 4,
          date: '2026-07-01',
          theme: 'consumer technology',
          text: 'Would you pay more for a device that protects your attention?',
          saved: true,
          lastUsedAt: '2026-07-01T00:00:00Z',
        }),
      } as Response);
    }
    if (url.includes('/api/prompt/library') && url.includes('saved=true')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          prompts: [{
            id: 4,
            date: '2026-07-01',
            theme: 'consumer technology',
            text: 'Would you pay more for a device that protects your attention?',
            saved: true,
          }],
        }),
      } as Response);
    }
    if (url.includes('/api/prompt/library')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          prompts: [{
            id: 5,
            date: '2026-07-01',
            theme: 'education technology',
            text: 'Describe a time when a tool changed how you learned something.',
            saved: false,
          }],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<DailyPrompt onPrompt={onPrompt} />);

  expect((await screen.findAllByText('Would you pay more for a device that protects your attention?')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }));

  expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument();
  expect(await screen.findByText('Saved prompts')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /consumer technology/i }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/prompt/4/use', expect.objectContaining({ method: 'POST', headers: expect.any(Headers) }));
    expect(onPrompt).toHaveBeenCalledWith(expect.objectContaining({ id: 4, saved: true }));
  });
});
