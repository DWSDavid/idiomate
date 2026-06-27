// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
