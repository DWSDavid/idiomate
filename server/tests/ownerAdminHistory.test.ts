import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Annotation } from '../../shared/types.js';
import { migrate, openDb } from '../src/db/db.js';
import {
  insertAnnotations,
  insertSentenceLabDraft,
  insertSession,
  recordSentenceLabResult,
  upsertUser,
  upsertVocab,
} from '../src/db/dal.js';

const originalEnv = { ...process.env };
let tempDir: string | undefined;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
  vi.resetModules();
});

async function withServer<T>(
  app: ReturnType<typeof import('../src/index.js').createApp>,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

function userHeaders(userId: string, name = userId): HeadersInit {
  return { 'x-user-id': userId, 'x-user-name': name };
}

it('keeps new users empty until owner vocab code imports the full vocabulary', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-owner-vocab-'));
  const ownerPath = join(tempDir, 'owner-vocab.txt');
  writeFileSync(ownerPath, [
    '1, risk premium',
    'n. the extra return investors demand',
    '',
    '2, move in lockstep',
    'phr. move together at the same pace',
  ].join('\n'));
  process.env.IDIOMATE_ENV_FILE = join(tempDir, 'missing.env');
  process.env.OWNER_VOCAB_CODE = 'owner-code';
  process.env.OWNER_VOCAB_PATH = ownerPath;
  vi.resetModules();

  const { createApp } = await import('../src/index.js');
  await withServer(createApp({ db }), async baseUrl => {
    const emptyList = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: userHeaders('rubi', 'Rubi'),
    });
    expect(emptyList.status).toBe(200);
    await expect(emptyList.json()).resolves.toMatchObject({ total: 0, items: [] });

    const rejected = await fetch(`${baseUrl}/api/vocab/owner-import`, {
      method: 'POST',
      headers: { ...userHeaders('rubi', 'Rubi'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'wrong-code' }),
    });
    expect(rejected.status).toBe(403);

    const imported = await fetch(`${baseUrl}/api/vocab/owner-import`, {
      method: 'POST',
      headers: { ...userHeaders('rubi', 'Rubi'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'owner-code' }),
    });
    expect(imported.status).toBe(201);
    await expect(imported.json()).resolves.toEqual({ imported: 2, total: 2 });

    const repeated = await fetch(`${baseUrl}/api/vocab/owner-import`, {
      method: 'POST',
      headers: { ...userHeaders('rubi', 'Rubi'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'owner-code' }),
    });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ imported: 0, total: 2 });
  });
}, 10_000);

it('exposes admin user summaries, user vocabulary, and saved writing history', async () => {
  process.env.ADMIN_CODE = 'admin-code';
  process.env.IDIOMATE_ENV_FILE = join(tmpdir(), 'idiomate-missing.env');
  vi.resetModules();

  upsertUser(db, 'alice', 'Alice');
  upsertVocab(db, 'alice', {
    word: 'equal footing',
    kind: 'phrase',
    defCn: 'same status',
    timesSuggested: 0,
    timesUsed: 0,
  });
  const sessionId = insertSession(db, 'alice', {
    date: '2026-06-08',
    draftText: 'My daily trial draft.',
    finalText: 'My revised daily trial draft.',
    source: 'daily_writing',
  });
  insertAnnotations(db, 'alice', sessionId, [{
    paragraphIdx: 0,
    span: 'daily trial',
    errorType: 'word_choice',
    hint: 'Choose a more native phrase.',
    explanation: 'Word choice issue.',
    modelRewrite: 'writing practice',
    rule: 'Word choice / collocation',
  } as Annotation & { paragraphIdx: number }]);
  const sentenceId = insertSentenceLabDraft(db, 'alice', {
    date: '2026-06-08',
    sentence: 'He discussed about the roadmap.',
    response: {
      paragraphIndex: 0,
      annotations: [{
        span: 'discussed about',
        errorType: 'small_grammar',
        hint: 'The verb already takes a direct object.',
        explanation: 'Discuss is transitive.',
        modelRewrite: 'discussed',
      }],
    },
  });
  recordSentenceLabResult(db, 'alice', { id: sentenceId, rewrite: 'He discussed the roadmap.' });

  const { createApp } = await import('../src/index.js');
  await withServer(createApp({ db }), async baseUrl => {
    const users = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { ...userHeaders('owner', 'Owner'), 'x-admin-code': 'admin-code' },
    });
    expect(users.status).toBe(200);
    const usersJson = await users.json();
    expect(usersJson.users).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'alice',
        name: 'Alice',
        vocabCount: 1,
        sessionCount: 2,
        sentenceLabCount: 1,
      }),
    ]));

    const detail = await fetch(`${baseUrl}/api/admin/users/alice`, {
      headers: { ...userHeaders('owner', 'Owner'), 'x-admin-code': 'admin-code' },
    });
    expect(detail.status).toBe(200);
    const detailJson = await detail.json();
    expect(detailJson.vocab.items[0]).toEqual(expect.objectContaining({
      word: 'equal footing',
      capturedDate: expect.any(String),
    }));
    expect(detailJson.history.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'daily_writing',
        draftText: 'My daily trial draft.',
        finalText: 'My revised daily trial draft.',
      }),
      expect.objectContaining({
        source: 'sentence_lab',
        draftText: 'He discussed about the roadmap.',
        finalText: 'He discussed the roadmap.',
      }),
    ]));
  });
});
