import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  askFollowUp,
  coach,
  captureWord,
  diagnoseSentenceLab,
  getProfile,
  getMistakes,
  getLesson,
  getTodayPrompt,
  getProgress,
  getVocabList,
  getAdminUserDetail,
  getAdminUsers,
  getHistory,
  importVocab,
  importOwnerVocab,
  primeVocab,
  recordParagraph,
  revealSentenceLabResult,
  researchEssay,
  saveChineseVocab,
  saveVocab,
  structureDraft,
  switchToRubiProfile,
  submitSession,
} from '../src/api';

const jsonResponse = (body: unknown) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body),
} as Response);

describe('client api', () => {
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
    vi.unstubAllGlobals();
  });

  it('uses the prompt, prime, profile, coach, session, and import endpoints', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/prompt/today')) return jsonResponse({ date: '2026-06-04', theme: 'tech', text: 'Write.' });
      if (url.includes('/api/vocab/list')) return jsonResponse({ total: 1, items: [] });
      if (url.includes('/api/vocab/owner-import')) return jsonResponse({ imported: 2, total: 2 });
      if (url.includes('/api/vocab/prime')) return jsonResponse({ topic: 'tech', vocab: [] });
      if (url.includes('/api/history')) return jsonResponse({ entries: [] });
      if (url.includes('/api/admin/users/alice')) return jsonResponse({ user: { id: 'alice' }, vocab: { total: 0, items: [] }, history: { entries: [] } });
      if (url.includes('/api/admin/users')) return jsonResponse({ users: [] });
      if (url.includes('/api/profile/rubi')) return jsonResponse({ user: { id: 'rubi', name: 'Rubi' }, imported: 2, total: 2, ownerVocabAvailable: true });
      if (url.includes('/api/profile')) return jsonResponse({ tallies: [], activation: { suggested: 0, used: 0 } });
      if (url.includes('/api/progress')) return jsonResponse({ daily: [], trend: [] });
      if (url.includes('/api/mistakes')) return jsonResponse({ mistakes: [] });
      if (url.includes('/api/lesson')) return jsonResponse({ errorType: 'redundancy', rules: [], principle: 'p', mindset: 'm', pastInstances: [], comparisonPairs: [] });
      if (url.includes('/api/research')) return jsonResponse({ analysis: 'a', otherAngles: [], sources: [], integratedEssay: 'e', integrationNotes: [] });
      if (url.includes('/api/structure')) return jsonResponse({ idealOutline: [], observations: [] });
      if (url.includes('/api/follow-up')) return jsonResponse({ answer: 'a', mode: 'pre_rewrite' });
      if (url.includes('/api/sentence-lab/diagnose')) return jsonResponse({ id: 1, sentence: 's', notes: [] });
      if (url.includes('/api/sentence-lab/result')) return jsonResponse({ id: 1, sentence: 's', rewrite: 'r', annotations: [] });
      if (url.includes('/api/coach')) return jsonResponse({ paragraphIndex: 2, annotations: [] });
      if (url.includes('/api/paragraph-result')) return jsonResponse({ id: 9 });
      if (url.includes('/api/sessions')) return jsonResponse({ id: 7 });
      if (url.includes('/api/vocab/import')) return jsonResponse({ count: 1 });
      if (url.includes('/api/vocab/capture')) return jsonResponse({ word: 'shore up' });
      if (url.includes('/api/vocab/save')) return jsonResponse({ id: 8, captureCount: 2, existed: true });
      if (url.includes('/api/vocab/from-chinese')) return jsonResponse({
        id: 9,
        captureCount: 1,
        existed: false,
        vocab: { id: 9, word: 'margin pressure', timesSuggested: 0, timesUsed: 0 },
      });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await getTodayPrompt();
    await getVocabList();
    await importOwnerVocab('owner-code');
    await primeVocab('tech risk');
    await getHistory();
    await getAdminUsers('admin-code');
    await getAdminUserDetail('admin-code', 'alice');
    await switchToRubiProfile('rubi-code');
    await getProfile();
    await getProgress();
    await getMistakes('redundancy');
    await getLesson('redundancy');
    await researchEssay('AI capex may pressure margins.');
    await structureDraft('AI capex may pressure margins.');
    await askFollowUp({
      scope: 'sentence_lab',
      mode: 'pre_rewrite',
      question: 'Why is this wordy?',
      original: 'This is wordy.',
      annotations: [{ span: 'wordy', errorType: 'redundancy' }],
    });
    await diagnoseSentenceLab('This sounds strange.', 'Slack message');
    await revealSentenceLabResult(1, 'This sounds natural.');
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
    await saveChineseVocab('\u5229\u6da6\u7387\u538b\u529b', 'AI capex may create this.');

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      '/api/prompt/today',
      '/api/vocab/list?limit=200',
      '/api/vocab/owner-import',
      '/api/vocab/prime?promptText=tech+risk&limit=10',
      '/api/history?limit=100',
      '/api/admin/users',
      '/api/admin/users/alice',
      '/api/profile/rubi',
      '/api/profile',
      '/api/progress',
      '/api/mistakes?type=redundancy&limit=50',
      '/api/lesson?type=redundancy',
      '/api/research',
      '/api/structure',
      '/api/follow-up',
      '/api/sentence-lab/diagnose',
      '/api/sentence-lab/result',
      '/api/coach',
      '/api/paragraph-result',
      '/api/sessions',
      '/api/vocab/import',
      '/api/vocab/capture',
      '/api/vocab/save',
      '/api/vocab/from-chinese',
    ]);

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      expect(headers.get('x-user-id')).toBeTruthy();
      expect(headers.get('x-user-name')).toBeTruthy();
    }
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(new Headers((fetchMock.mock.calls[5][1] as RequestInit).headers).get('x-admin-code')).toBe('admin-code');
    expect(fetchMock.mock.calls[7][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[12][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[14][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[19][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[23][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('idiomate_uid')).toBe('rubi');
    expect(localStorage.getItem('idiomate_user_name')).toBe('Rubi');
  });

  it('sends a saved access code with api requests', async () => {
    localStorage.setItem('idiomate_access_code', 'share-code');
    const fetchMock = vi.fn(() => jsonResponse({ date: '2026-06-04', theme: 'tech', text: 'Write.' }));
    vi.stubGlobal('fetch', fetchMock);

    await getTodayPrompt();

    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('x-access-code')).toBe('share-code');
  });
});
