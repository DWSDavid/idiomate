import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coach,
  captureWord,
  getProfile,
  getMistakes,
  getLesson,
  getTodayPrompt,
  importVocab,
  primeVocab,
  recordParagraph,
  researchEssay,
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
      if (url.includes('/api/mistakes')) return jsonResponse({ mistakes: [] });
      if (url.includes('/api/lesson')) return jsonResponse({ errorType: 'redundancy', rules: [], principle: 'p', mindset: 'm', pastInstances: [], comparisonPairs: [] });
      if (url.includes('/api/research')) return jsonResponse({ analysis: 'a', otherAngles: [], sources: [], integratedEssay: 'e', integrationNotes: [] });
      if (url.includes('/api/coach')) return jsonResponse({ paragraphIndex: 2, annotations: [] });
      if (url.includes('/api/paragraph-result')) return jsonResponse({ id: 9 });
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
    await getMistakes('redundancy');
    await getLesson('redundancy');
    await researchEssay('AI capex may pressure margins.');
    await coach('A paragraph.', 2);
    await recordParagraph({
      date: '2026-06-05',
      paragraphIdx: 2,
      paragraph: 'A paragraph.',
      rewrite: 'A clearer paragraph.',
      annotations: [],
    });
    await submitSession({ draftText: 'A paragraph.', annotations: [] });
    await importVocab(new File(['word'], 'vocabs.txt', { type: 'text/plain' }));
    await captureWord('shore up', 'We need to shore up margins.');
    await saveVocab({ word: 'shore up', timesSuggested: 0, timesUsed: 0 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/prompt/today');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/vocab/prime?promptText=tech+risk&limit=10');
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/profile');
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/mistakes?type=redundancy&limit=50');
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/lesson?type=redundancy');
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/research', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, '/api/coach', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, '/api/paragraph-result', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(9, '/api/sessions', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(10, '/api/vocab/import', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(11, '/api/vocab/capture', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(12, '/api/vocab/save', expect.objectContaining({ method: 'POST' }));
  });
});
