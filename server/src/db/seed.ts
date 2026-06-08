import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { parseYoudaoTxt } from '../import/youdao.js';
import { insertVocab } from './dal.js';

const parsedCache = new Map<string, ReturnType<typeof parseYoudaoTxt>>();

export function seedUserVocab(db: Database.Database, userId: string, seedPath: string) {
  if (!seedPath || !existsSync(seedPath)) return;

  let vocab = parsedCache.get(seedPath);
  if (!vocab) {
    vocab = parseYoudaoTxt(readFileSync(seedPath));
    parsedCache.set(seedPath, vocab);
  }
  if (!vocab.length) return;

  insertVocab(db, userId, vocab);
}
