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

vi.mock('../../client/src/components/CaptureWord', async () => {
  const React = await import('react');
  return {
    CaptureWord: ({
    captureSource,
    initialContextSentence,
    initialWord,
  }: {
    captureSource?: string;
    initialContextSentence?: string;
    initialWord?: string;
  }) => {
      const [mountedProps] = React.useState({
        captureSource,
        initialContextSentence,
        initialWord,
      });

      return (
        <div>
          <button type="button" onClick={() => void fetch('/api/vocab/capture')}>
            Start capture
          </button>
          <p data-testid="capture-word">{mountedProps.initialWord}</p>
          <p data-testid="capture-source">{mountedProps.captureSource}</p>
          <p data-testid="capture-context">{mountedProps.initialContextSentence}</p>
        </div>
      );
    },
  };
});

vi.mock('../../client/src/components/SentenceLab', () => ({
  SentenceLab: () => <div>Sentence lab</div>,
}));

vi.mock('../../client/src/components/SpeakingReview', () => ({
  SpeakingReview: ({ contextDefaults }: { contextDefaults?: { contextLabel?: string; contextTitle?: string; contextUrl?: string; contextExcerpt?: string } }) => (
    <div>
      <p>Speaking review</p>
      <p>{contextDefaults?.contextLabel}</p>
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
    url: 'https://example.com/ai-agents?token=secret#private',
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
  expect(screen.getByText('reading_reaction')).toBeInTheDocument();
  expect(screen.getByText('AI agents move into finance workflows')).toBeInTheDocument();
  expect(screen.getByText('https://example.com/ai-agents')).toBeInTheDocument();
  expect(screen.queryByText('https://example.com/ai-agents?token=secret#private')).not.toBeInTheDocument();
  expect(screen.getByText('Agents are entering finance workflows faster than expected.', { selector: 'p' })).toBeInTheDocument();
});

it('clears pending page metadata and website_reading source after manual edits', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  const pendingSelection = {
    text: 'Agents are entering finance workflows faster than expected.',
    ts: Date.now(),
    title: 'AI agents move into finance workflows',
    url: 'https://example.com/ai-agents?token=secret#private',
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({ idiomate_pending_selection: pendingSelection })),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  const sourceTextarea = await screen.findByLabelText('Selected or pasted text');
  fireEvent.change(sourceTextarea, { target: { value: 'Manual reflection about revenue pressure.' } });

  fireEvent.click(screen.getByRole('button', { name: 'Speak' }));

  expect(screen.getByText('Speaking review')).toBeInTheDocument();
  expect(screen.getByText('reading_reaction')).toBeInTheDocument();
  expect(screen.queryByText('AI agents move into finance workflows')).not.toBeInTheDocument();
  expect(screen.queryByText('https://example.com/ai-agents')).not.toBeInTheDocument();
  expect(screen.queryByText('https://example.com/ai-agents?token=secret#private')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Word' }));

  expect(screen.getByTestId('capture-word')).toHaveTextContent('Manual reflection about revenue pressure.');
  expect(screen.getByTestId('capture-source')).toBeEmptyDOMElement();
  expect(screen.getByTestId('capture-context')).toBeEmptyDOMElement();
});

it('refreshes word capture context when the same text is selected on a different page', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: chrome.storage.AreaName) => void> = [];
  const firstSelection = {
    text: 'margin',
    ts: 1000,
    title: 'Page A',
    url: 'https://example.com/page-a?token=secret#private',
  };
  const secondSelection = {
    text: 'margin',
    ts: 2000,
    title: 'Page B',
    url: 'https://example.com/page-b?token=secret#private',
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({ idiomate_pending_selection: firstSelection })),
      },
      onChanged: {
        addListener: vi.fn(listener => listeners.push(listener)),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByTestId('capture-context')).toHaveTextContent(
      'From Page A: https://example.com/page-a: margin',
    );
  });

  listeners.forEach(listener => listener({
    idiomate_pending_selection: { newValue: secondSelection },
  } as Record<string, chrome.storage.StorageChange>, 'local'));

  await waitFor(() => {
    expect(screen.getByTestId('capture-context')).toHaveTextContent(
      'From Page B: https://example.com/page-b: margin',
    );
  });
});
