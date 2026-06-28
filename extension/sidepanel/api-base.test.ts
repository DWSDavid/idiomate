import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (body: unknown) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body),
} as Response);

describe('extension api base behavior', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps api requests relative when VITE_API_BASE is unset', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ date: '2026-06-04', theme: 'tech', text: 'Write.' }));
    vi.stubGlobal('fetch', fetchMock);
    const { getTodayPrompt } = await import('../../client/src/api');

    await getTodayPrompt();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/prompt/today');
  });

  it('prefixes api requests when VITE_API_BASE is set', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://idiomate.onrender.com');
    const fetchMock = vi.fn(() => jsonResponse({ date: '2026-06-04', theme: 'tech', text: 'Write.' }));
    vi.stubGlobal('fetch', fetchMock);
    const { getTodayPrompt } = await import('../../client/src/api');

    await getTodayPrompt();

    expect(fetchMock.mock.calls[0][0]).toBe('https://idiomate.onrender.com/api/prompt/today');
  });
});
