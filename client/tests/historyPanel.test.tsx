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
        nativeText: 'This article offers a useful perspective.',
        elevatedText: 'This article provides a timely perspective on how agents are reshaping finance work.',
        evidenceText: 'AI agents are moving into finance workflows. Evidence from the article shows faster adoption, which suggests the shift is already operational rather than hypothetical.',
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
      }, {
        id: 2,
        source: 'coach_review',
        date: '2026-06-29',
        draftText: 'Unsafe context should stay readable.',
        finalText: 'Unsafe context should stay readable.',
        context: {
          label: 'reading_reaction',
          title: 'Unsafe context',
          url: 'javascript:alert(1)',
          excerpt: 'This URL must not be clickable.',
        },
        annotations: [],
      }],
    }),
  } as Response)));

  render(<HistoryPanel />);

  expect(await screen.findByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'https://example.com/ai-agents' })).toHaveAttribute('href', 'https://example.com/ai-agents');
  expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
  expect(screen.getByText('Agents are entering finance workflows faster than expected.')).toBeInTheDocument();
  expect(screen.getAllByText('Original').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Your rewrite / saved final').length).toBeGreaterThan(0);
  expect(screen.getByText('Grammar polished')).toBeInTheDocument();
  expect(screen.getByText('Elevated version')).toBeInTheDocument();
  expect(screen.getByText('Evidence highlighted version')).toBeInTheDocument();
});
