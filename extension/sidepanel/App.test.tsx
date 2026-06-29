// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ACCESS_DENIED_EVENT } from '../../client/src/api';
import App from './App';

vi.mock('../../client/src/components/AccessGate', () => ({
  AccessGate: () => <div>Access gate</div>,
}));

vi.mock('../../client/src/components/CaptureWord', () => ({
  CaptureWord: () => (
    <button type="button" onClick={() => void fetch('/api/vocab/capture')}>
      Start capture
    </button>
  ),
}));

vi.mock('../../client/src/components/SentenceLab', () => ({
  SentenceLab: () => <div>Sentence lab</div>,
}));

vi.mock('../../client/src/components/SpeakingReview', () => ({
  SpeakingReview: ({ contextDefaults }: { contextDefaults?: { contextTitle?: string; contextUrl?: string; contextExcerpt?: string } }) => (
    <div>
      <p>Speaking review</p>
      <p>{contextDefaults?.contextTitle}</p>
      <p>{contextDefaults?.contextUrl}</p>
      <p>{contextDefaults?.contextExcerpt}</p>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('clears the stored access code and shows AccessGate after access is denied', async () => {
  localStorage.setItem('idiomate_access_code', 'bad-code');

  render(<App />);
  globalThis.dispatchEvent(new Event(ACCESS_DENIED_EVENT));

  await waitFor(() => expect(screen.getByText('Access gate')).toBeInTheDocument());
  expect(localStorage.getItem('idiomate_access_code')).toBeNull();
});

it('shows the cold-start notice while a panel request is in flight', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  let resolveFetch: (() => void) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(resolve => {
      resolveFetch = () => resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    })),
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Start capture' }));

  expect(await screen.findByText('Waking the server, ~20s on first request')).toBeInTheDocument();
  resolveFetch?.();
  await waitFor(() => {
    expect(screen.queryByText('Waking the server, ~20s on first request')).not.toBeInTheDocument();
  });
});

it('offers Speak mode with page context from the pending selection', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: chrome.storage.AreaName) => void> = [];
  const pendingSelection = {
    text: 'Agents are entering finance workflows faster than expected.',
    ts: Date.now(),
    title: 'AI agents move into finance workflows',
    url: 'https://example.com/ai-agents',
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({ idiomate_pending_selection: pendingSelection })),
      },
      onChanged: {
        addListener: vi.fn(listener => listeners.push(listener)),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Speak' }));
  expect(screen.getByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByText('https://example.com/ai-agents')).toBeInTheDocument();
  expect(screen.getByText('Agents are entering finance workflows faster than expected.', { selector: 'p' })).toBeInTheDocument();
});
