// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders speaking review history with friendly label and reading context', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      entries: [{
        id: 1,
        source: 'speaking_review',
        date: '2026-06-29',
        draftText: 'This article has a useful perspective.',
        finalText: 'This article offers a useful perspective.',
        context: {
          label: 'reading_reaction',
          title: 'AI agents move into finance workflows',
          url: 'https://example.com/ai-agents',
          excerpt: 'Agents are entering finance workflows faster than expected.',
        },
        annotations: [{
          span: 'has a useful perspective',
          errorType: 'word_choice',
          accepted: true,
        }],
      }],
    }),
  } as Response)));

  render(<HistoryPanel />);

  expect(await screen.findByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'https://example.com/ai-agents' })).toHaveAttribute('href', 'https://example.com/ai-agents');
  expect(screen.getByText('Agents are entering finance workflows faster than expected.')).toBeInTheDocument();
});
