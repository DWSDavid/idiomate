// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfileDashboard } from '../src/components/ProfileDashboard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows ranked mistakes and renders a structured teaching lesson with book linkage', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/profile')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          tallies: [{ errorType: 'tense', count: 2, lastSeen: '2026-06-05' }],
          ranking: [{
            errorType: 'tense',
            count: 2,
            lastSeen: '2026-06-05',
            recentExamples: [{
              span: 'Over time, robots are more humanized than before.',
              userRewrite: 'Over time, robots will be more humanized than before.',
              rule: 'Keep one time frame',
              date: '2026-06-05',
            }],
          }],
          activation: { suggested: 0, used: 0 },
        }),
      } as Response);
    }
    if (url.includes('/api/mistakes')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          mistakes: [{
            errorType: 'tense',
            span: 'Yesterday I go to the meeting',
            userRewrite: 'Yesterday I went to the meeting',
            rule: 'Keep one time frame',
            date: '2026-06-01',
          }],
        }),
      } as Response);
    }
    if (url.includes('/api/lesson')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          errorType: 'tense',
          rules: [{
            name: 'Keep one time frame',
            principle: 'Hold one tense unless the time anchor changes.',
            mindset: 'Ask what time frame the reader is standing in.',
            bookReference: {
              source: "The Translator's Guide to Chinglish",
              pattern: 'Unnecessary shifts in verb time weaken the reader timeline.',
              quoteStatus: 'Attach the PDF to show exact source quotes.',
              exampleBefore: 'Yesterday I go to the meeting.',
              exampleAfter: 'Yesterday I went to the meeting.',
            },
          }],
          principle: 'Keep the time anchor stable before choosing verb forms.',
          mindset: 'First locate the timeline, then choose the verb form.',
          pastInstances: [{
            errorType: 'tense',
            span: 'Over time, robots are more humanized than before.',
            userRewrite: 'Over time, robots will be more humanized than before.',
            rule: 'Keep one time frame',
            date: '2026-06-05',
          }],
          comparisonPairs: [
            { before: 'Over time, robots are more humanized than before.', after: 'Over time, robots will be more humanized than before.', note: 'future projection' },
            { before: 'Yesterday I go to the meeting.', after: 'Yesterday I went to the meeting.', note: 'past time anchor' },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ProfileDashboard />);

  expect(await screen.findByText('tense')).toBeInTheDocument();
  expect(screen.getByText('Over time, robots are more humanized than before.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Open tense mistakes/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/mistakes?type=tense&limit=50');
    expect(screen.getByText('Yesterday I go to the meeting')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: /Learn tense/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/lesson?type=tense');
    expect(screen.getByText('What is the pattern?')).toBeInTheDocument();
    expect(screen.getByText('Why it feels unnatural')).toBeInTheDocument();
    expect(screen.getByText('How to repair it')).toBeInTheDocument();
    expect(screen.getByText('Book connection')).toBeInTheDocument();
    expect(screen.getByText("The Translator's Guide to Chinglish")).toBeInTheDocument();
    expect(screen.getByText('Attach the PDF to show exact source quotes.')).toBeInTheDocument();
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  expect(screen.queryByText('Yesterday I go to the meeting. to Yesterday I went to the meeting.')).not.toBeInTheDocument();
});
