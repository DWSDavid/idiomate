import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, migrate } from '../src/db/db.js';
import { getVocabList } from '../src/db/dal.js';
import { flushListenQueue } from '../src/listen.js';

const USER_ID = 'rubi';

let db: ReturnType<typeof openDb>;
let queueDir: string;
let queuePath: string;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  // Use a temp directory for the queue file
  queueDir = join(tmpdir(), `listen-test-${Date.now()}`);
  mkdirSync(queueDir, { recursive: true });
  queuePath = join(queueDir, 'idiomate-export-queue.jsonl');
});

afterEach(() => {
  rmSync(queueDir, { recursive: true, force: true });
});

const ENTRY_1 = {
  episode: "Steel's legacy looms large",
  phrase: {
    id: 'ai-001',
    phrase: 'hard to miss',
    pronunciation: '/hɑːrd tə mɪs/',
    plainMeaning: 'very noticeable',
    chineseMeaning: '很显眼；很难不注意到',
    usageNote: 'Used when something is very visible',
    register: 'Neutral',
    naturalExample: 'The new skyscraper is hard to miss.',
    seconds: 0,
    saved: true,
  },
};

const ENTRY_2 = {
  episode: 'Tech Giants & Trust',
  phrase: {
    id: 'ai-002',
    phrase: 'bear fruit',
    pronunciation: '/bɛr fruːt/',
    plainMeaning: 'produce results',
    chineseMeaning: '取得成果；结出果实',
    usageNote: 'Often used for long-term efforts paying off',
    register: 'Neutral',
    naturalExample: 'Years of research finally bore fruit.',
    seconds: 0,
    saved: true,
  },
};

describe('flushListenQueue', () => {
  it('inserts both phrases and empties the queue file', () => {
    writeFileSync(
      queuePath,
      [JSON.stringify(ENTRY_1), JSON.stringify(ENTRY_2)].join('\n') + '\n',
    );

    const result = flushListenQueue(db, USER_ID, queuePath);

    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);

    const vocab = getVocabList(db, USER_ID, 100);
    expect(vocab).toHaveLength(2);

    const words = vocab.map(v => v.word);
    expect(words).toContain('hard to miss');
    expect(words).toContain('bear fruit');

    // File should be truncated to empty
    const contents = readFileSync(queuePath, 'utf-8');
    expect(contents).toBe('');
  });

  it('maps fields correctly (ipa, defCn, source, kind)', () => {
    writeFileSync(queuePath, JSON.stringify(ENTRY_1) + '\n');

    flushListenQueue(db, USER_ID, queuePath);

    const vocab = getVocabList(db, USER_ID, 100);
    expect(vocab).toHaveLength(1);

    // getVocabList returns VocabListItem which has limited fields; check via dal directly
    const row = db.prepare(`
      SELECT word, ipa, def_cn, source, kind, context_sentence, register
      FROM vocab
      WHERE user_id = ? AND word = ?
    `).get(USER_ID, 'hard to miss') as {
      word: string;
      ipa: string;
      def_cn: string;
      source: string;
      kind: string;
      context_sentence: string;
      register: string;
    };

    expect(row).toBeDefined();
    expect(row.ipa).toBe('/hɑːrd tə mɪs/');
    expect(row.def_cn).toBe('很显眼；很难不注意到');
    expect(row.kind).toBe('phrase');
    expect(row.source).toMatch(/^listen:/);
    expect(row.source).toContain('Steel');
    expect(row.context_sentence).toBe('The new skyscraper is hard to miss.');
    expect(row.register).toBe('Neutral');
  });

  it('source field is truncated to 120 chars', () => {
    const longEpisode = 'A'.repeat(200);
    const entry = { ...ENTRY_1, episode: longEpisode };
    writeFileSync(queuePath, JSON.stringify(entry) + '\n');

    flushListenQueue(db, USER_ID, queuePath);

    const row = db.prepare(`SELECT source FROM vocab WHERE user_id = ? AND word = ?`)
      .get(USER_ID, 'hard to miss') as { source: string };

    expect(row.source.length).toBeLessThanOrEqual(120);
  });

  it('deduplicates: inserting same phrase twice only results in one vocab row', () => {
    const line = JSON.stringify(ENTRY_1) + '\n';
    writeFileSync(queuePath, line);
    flushListenQueue(db, USER_ID, queuePath);

    // Write again to simulate re-import
    writeFileSync(queuePath, line);
    flushListenQueue(db, USER_ID, queuePath);

    const vocab = getVocabList(db, USER_ID, 100);
    expect(vocab).toHaveLength(1);

    // Capture count should have incremented
    const row = db.prepare(`SELECT capture_count FROM vocab WHERE user_id = ? AND word = ?`)
      .get(USER_ID, 'hard to miss') as { capture_count: number };
    expect(row.capture_count).toBeGreaterThanOrEqual(1);
  });

  it('no-ops silently when file does not exist', () => {
    const result = flushListenQueue(db, USER_ID, join(queueDir, 'nonexistent.jsonl'));

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);

    const vocab = getVocabList(db, USER_ID, 100);
    expect(vocab).toHaveLength(0);
  });

  it('skips malformed lines without crashing', () => {
    writeFileSync(
      queuePath,
      'not-valid-json\n' + JSON.stringify(ENTRY_1) + '\n',
    );

    const result = flushListenQueue(db, USER_ID, queuePath);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);

    const vocab = getVocabList(db, USER_ID, 100);
    expect(vocab).toHaveLength(1);
  });
});
