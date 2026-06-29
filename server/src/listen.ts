import type Database from 'better-sqlite3';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { upsertVocabWithResult } from './db/dal.js';

const QUEUE_PATH = join(
  homedir(),
  'Library/Application Support/IdiomateListen/idiomate-export-queue.jsonl',
);

interface ListenPhrase {
  id?: string;
  phrase: string;
  pronunciation?: string;
  plainMeaning?: string;
  chineseMeaning?: string;
  usageNote?: string;
  register?: string;
  naturalExample?: string;
  seconds?: number;
  saved?: boolean;
}

interface ListenQueueEntry {
  episode?: string;
  phrase: ListenPhrase;
}

interface FlushResult {
  inserted: number;
  skipped: number;
}

export function flushListenQueue(
  db: Database.Database,
  userId: string,
  queuePath = QUEUE_PATH,
): FlushResult {
  if (!existsSync(queuePath)) {
    return { inserted: 0, skipped: 0 };
  }

  const raw = readFileSync(queuePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim() !== '');

  let inserted = 0;
  let skipped = 0;

  for (const line of lines) {
    let entry: ListenQueueEntry;
    try {
      entry = JSON.parse(line) as ListenQueueEntry;
    } catch {
      skipped += 1;
      continue;
    }

    const p = entry.phrase;
    if (!p || typeof p.phrase !== 'string' || !p.phrase.trim()) {
      skipped += 1;
      continue;
    }

    const episodePart = entry.episode ?? '';
    const rawSource = `listen:${episodePart}`;
    const source = rawSource.length > 120 ? rawSource.slice(0, 120) : rawSource;

    try {
      upsertVocabWithResult(db, userId, {
        word: p.phrase,
        ipa: p.pronunciation,
        defCn: p.chineseMeaning,
        pos: undefined,
        kind: 'phrase',
        source,
        contextSentence: p.naturalExample,
        register: p.register,
        captureCount: 1,
        status: 'active',
        timesSuggested: 0,
        timesUsed: 0,
      });
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }

  // Truncate file after flushing
  writeFileSync(queuePath, '');

  return { inserted, skipped };
}

export function startListenBridge(db: Database.Database, userId: string): void {
  const queuePath = QUEUE_PATH;

  // Flush any existing entries on startup
  try {
    flushListenQueue(db, userId, queuePath);
  } catch (err) {
    console.warn('[listen-bridge] startup flush failed:', err);
  }

  if (!existsSync(queuePath)) {
    // File doesn't exist yet; we can't watch a non-existent file directly.
    // Watch the parent directory for the file to appear, then switch to file watch.
    return;
  }

  try {
    watch(queuePath, () => {
      try {
        flushListenQueue(db, userId, queuePath);
      } catch (err) {
        console.warn('[listen-bridge] flush after file change failed:', err);
      }
    });
  } catch (err) {
    console.warn('[listen-bridge] failed to watch queue file:', err);
  }
}
