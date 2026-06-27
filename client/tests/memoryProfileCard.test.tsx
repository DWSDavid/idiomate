// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryProfileCard } from '../src/components/MemoryProfileCard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows top patterns, indexed sessions, and vocab ease breakdown', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      topWeaknesses: [
        { errorType: 'article_misuse', count: 4 },
        { errorType: 'noun_plague', count: 2 },
        { errorType: 'word_choice', count: 1 },
        { errorType: 'tense', count: 1 },
      ],
      totalSessions: 8,
      sessionEmbeddingsCount: 5,
      vocabCount: 13,
      vocabByEase: { new: 6, hard: 3, easy: 4 },
    }),
  } as Response)));

  render(<MemoryProfileCard />);

  expect(await screen.findByText('What I know about you')).toBeInTheDocument();
  expect(screen.getByText('Article misuse')).toBeInTheDocument();
  expect(screen.getByText('Noun plague')).toBeInTheDocument();
  expect(screen.getByText('Word choice')).toBeInTheDocument();
  expect(screen.queryByText('Tense')).not.toBeInTheDocument();
  expect(screen.getByText('5 of 8 sessions analyzed.')).toBeInTheDocument();
  expect(screen.getByText('13 words - 6 new - 3 to revisit - 4 confident')).toBeInTheDocument();
});

it('shows an empty profile message before there is memory', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      topWeaknesses: [],
      totalSessions: 0,
      sessionEmbeddingsCount: 0,
      vocabCount: 0,
      vocabByEase: { new: 0, hard: 0, easy: 0 },
    }),
  } as Response)));

  render(<MemoryProfileCard />);

  expect(await screen.findByText('Write a few sessions and I will start building your profile.')).toBeInTheDocument();
});
