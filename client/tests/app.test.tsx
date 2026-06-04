// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('renders the single-page writing workspace', async () => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/prompt/today')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ date: '2026-06-04', theme: 'tech', text: 'Write one paragraph.' }) } as Response);
    }
    if (url.includes('/api/vocab/prime')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topic: 'tech', vocab: [] }) } as Response);
    }
    if (url.includes('/api/profile')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ tallies: [], activation: { suggested: 0, used: 0 } }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }));

  render(<App />);

  expect(await screen.findByText(/Today's prompt/)).toBeInTheDocument();
  expect(screen.getByLabelText('Draft')).toBeInTheDocument();
  expect(screen.getByText('Your patterns')).toBeInTheDocument();
});
