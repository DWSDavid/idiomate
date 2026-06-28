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
