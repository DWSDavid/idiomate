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

it('shows ranked mistakes and expands a row into stored examples', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/profile')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          tallies: [{ errorType: 'redundancy', count: 2, lastSeen: '2026-06-05' }],
          ranking: [{
            errorType: 'redundancy',
            count: 2,
            lastSeen: '2026-06-05',
            recentExamples: [{
              span: 'in order to',
              userRewrite: 'to',
              rule: 'Drop empty category nouns',
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
            errorType: 'redundancy',
            span: 'in a state of rapid growth',
            userRewrite: 'growing rapidly',
            rule: 'Drop empty category nouns',
            date: '2026-06-01',
          }],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ProfileDashboard />);

  expect(await screen.findByText('redundancy')).toBeInTheDocument();
  expect(screen.getByText('in order to')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Open redundancy mistakes/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/mistakes?type=redundancy&limit=50');
    expect(screen.getByText('in a state of rapid growth')).toBeInTheDocument();
  });
});
