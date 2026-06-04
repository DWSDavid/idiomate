import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coach,
  captureWord,
  getProfile,
  getTodayPrompt,
  importVocab,
  primeVocab,
  saveVocab,
  submitSession,
} from '../src/api';

const jsonResponse = (body: unknown) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body),
} as Response);

describe('client api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the prompt, prime, profile, coach, session, and import endpoints', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/prompt/today')) return jsonResponse({ date: '2026-06-04', theme: 'tech', text: 'Write.' });
      if (url.includes('/api/vocab/prime')) return jsonResponse({ topic: 'tech', vocab: [] });
      if (url.includes('/api/profile')) return jsonResponse({ tallies: [], activation: { suggested: 0, used: 0 } });
      if (url.includes('/api/coach')) return jsonResponse({ paragraphIndex: 2, annotations: [] });
      if (url.includes('/api/sessions')) return jsonResponse({ id: 7 });
      if (url.includes('/api/vocab/import')) return jsonResponse({ count: 1 });
      if (url.includes('/api/vocab/capture')) return jsonResponse({ word: 'shore up' });
      if (url.includes('/api/vocab/save')) return jsonResponse({ id: 8 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await getTodayPrompt();
    await primeVocab('tech risk');
    await getProfile();
    await coach('A paragraph.', 2);
    await submitSession({ draftText: 'A paragraph.', annotations: [] });
    await importVocab(new File(['word'], 'vocabs.txt', { type: 'text/plain' }));
    await captureWord('shore up', 'We need to shore up margins.');
    await saveVocab({ word: 'shore up', timesSuggested: 0, timesUsed: 0 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/prompt/today');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/vocab/prime?promptText=tech+risk&limit=10');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/profile');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/coach', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/sessions', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/vocab/import', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/vocab/capture', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/vocab/save', expect.objectContaining({ method: 'POST' }));
  });
});
