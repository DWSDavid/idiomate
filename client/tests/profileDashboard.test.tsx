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
    if (url.includes('/api/lesson')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          errorType: 'redundancy',
          rules: [{
            name: 'Drop empty category nouns',
            principle: 'Cut filler category nouns that add no meaning.',
            mindset: '中文里重复和铺垫有时显得完整, 英文读者更期待每个词增加新信息.',
          }],
          principle: '删掉没有新信息的铺垫词。',
          mindset: '先问每个词是否增加新信息。',
          pastInstances: [{
            errorType: 'redundancy',
            span: 'in order to',
            userRewrite: 'to',
            rule: 'Drop empty category nouns',
            date: '2026-06-05',
          }],
          comparisonPairs: [
            { before: 'in a state of rapid growth', after: 'growing rapidly' },
            { before: 'in order to', after: 'to' },
            { before: 'made an improvement', after: 'improved' },
            { before: 'help and assistance', after: 'help' },
          ],
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

  fireEvent.click(screen.getByRole('button', { name: /Learn redundancy/ }));

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/lesson?type=redundancy');
    expect(screen.getByText('删掉没有新信息的铺垫词。')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'in a state of rapid growth to growing rapidly')).toBeInTheDocument();
  });
});
