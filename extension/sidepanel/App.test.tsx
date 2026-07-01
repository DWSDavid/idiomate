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
    captureSourceTitle,
    captureSourceUrl,
    initialContextSentence,
    initialWord,
  }: {
    captureSource?: string;
    captureSourceTitle?: string;
    captureSourceUrl?: string;
    initialContextSentence?: string;
    initialWord?: string;
  }) => {
      const [mountedProps] = React.useState({
        captureSource,
        captureSourceTitle,
        captureSourceUrl,
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
          <p data-testid="capture-source-title">{mountedProps.captureSourceTitle}</p>
          <p data-testid="capture-source-url">{mountedProps.captureSourceUrl}</p>
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
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/profile/rubi')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            user: { id: 'rubi', name: 'Rubi' },
            imported: 0,
            total: 0,
            ownerVocabAvailable: true,
          }),
        } as Response);
      }

      return new Promise<Response>(resolve => {
        resolveFetch = () => resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });
    }),
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Start capture' }));

  expect(await screen.findByText('Waking the server, ~20s on first request')).toBeInTheDocument();
  resolveFetch?.();
  await waitFor(() => {
    expect(screen.queryByText('Waking the server, ~20s on first request')).not.toBeInTheDocument();
  });
});

it('activates the Rubi profile identity when the extension already has an access code', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/profile/rubi')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          user: { id: 'rubi', name: 'Rubi' },
          imported: 0,
          total: 2701,
          ownerVocabAvailable: true,
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  await waitFor(() => {
    expect(localStorage.getItem('idiomate_uid')).toBe('rubi');
    expect(localStorage.getItem('idiomate_user_name')).toBe('Rubi');
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/profile/rubi', expect.objectContaining({
    method: 'POST',
  }));
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

it('uses the active tab as source context for manual word capture', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(() => Promise.resolve([{
        title: 'Markets digest: AI capex cycle',
        url: 'https://example.com/markets?utm=secret#comments',
      }])),
    },
  });

  render(<App />);

  const sourceTextarea = screen.getByLabelText('Selected or pasted text');
  fireEvent.change(sourceTextarea, { target: { value: 'capex cycle' } });

  await waitFor(() => {
    expect(screen.getByTestId('capture-source')).toHaveTextContent('website_reading');
    expect(screen.getByTestId('capture-source-title')).toHaveTextContent('Markets digest: AI capex cycle');
    expect(screen.getByTestId('capture-source-url')).toHaveTextContent('https://example.com/markets');
    expect(screen.getByTestId('capture-context')).toHaveTextContent(
      'From Markets digest: AI capex cycle: https://example.com/markets: capex cycle',
    );
  });
});

it('pulls the current page selection into the side panel input', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(() => Promise.resolve([{
        id: 12,
        title: 'FT: Investors chase above-norm growth',
        url: 'https://www.ft.com/content/growth?shareType=nongift#comments',
      }])),
      sendMessage: vi.fn(() => Promise.resolve({
        text: 'above-norm growth',
        title: 'FT: Investors chase above-norm growth',
        url: 'https://www.ft.com/content/growth?shareType=nongift#comments',
        ts: 3000,
      })),
    },
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByLabelText('Selected or pasted text')).toHaveValue('above-norm growth');
    expect(screen.getByTestId('capture-source')).toHaveTextContent('website_reading');
    expect(screen.getByTestId('capture-source-title')).toHaveTextContent('FT: Investors chase above-norm growth');
    expect(screen.getByTestId('capture-source-url')).toHaveTextContent('https://www.ft.com/content/growth');
    expect(screen.getByTestId('capture-context')).toHaveTextContent(
      'From FT: Investors chase above-norm growth: https://www.ft.com/content/growth: above-norm growth',
    );
  });
});

it('falls back to scripting when the content script cannot answer selection requests', async () => {
  localStorage.setItem('idiomate_access_code', 'Rubi8');
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn(() => Promise.resolve([{
        id: 15,
        title: 'FT fallback page',
        url: 'https://www.ft.com/content/fallback?shareType=nongift',
      }])),
      sendMessage: vi.fn(() => Promise.reject(new Error('no receiver'))),
    },
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([{
        result: {
          text: 'above-norm growth',
          title: 'FT fallback page',
          url: 'https://www.ft.com/content/fallback?shareType=nongift',
          ts: 4000,
        },
      }])),
    },
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  });

  render(<App />);

  await waitFor(() => {
    expect(screen.getByLabelText('Selected or pasted text')).toHaveValue('above-norm growth');
    expect(screen.getByTestId('capture-source')).toHaveTextContent('website_reading');
    expect(screen.getByTestId('capture-source-url')).toHaveTextContent('https://www.ft.com/content/fallback');
  });
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
