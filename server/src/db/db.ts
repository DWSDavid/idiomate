import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path = config.dbPath) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new Database(path);
}

export function migrate(db: Database.Database) {
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  db.prepare(`
    INSERT INTO users (id, name)
    VALUES ('local', 'Local')
    ON CONFLICT(id) DO UPDATE SET name = COALESCE(users.name, excluded.name)
  `).run();
  ensureColumn(db, 'vocab', 'user_id', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'sessions', 'user_id', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'sessions', 'source', "TEXT DEFAULT 'daily_writing'");
  ensureColumn(db, 'sessions', 'created_at', 'TEXT');
  ensureColumn(db, 'sessions', 'context_label', 'TEXT');
  ensureColumn(db, 'sessions', 'context_title', 'TEXT');
  ensureColumn(db, 'sessions', 'context_url', 'TEXT');
  ensureColumn(db, 'sessions', 'context_excerpt', 'TEXT');
  ensureColumn(db, 'sessions', 'native_text', 'TEXT');
  ensureColumn(db, 'sessions', 'elevated_text', 'TEXT');
  ensureColumn(db, 'sessions', 'evidence_text', 'TEXT');
  ensureColumn(db, 'prompts', 'user_id', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'prompts', 'news_items', 'TEXT');
  ensureColumn(db, 'prompts', 'essay_prompt', 'TEXT');
  ensureColumn(db, 'prompts', 'source_quotes', 'TEXT');
  ensureColumn(db, 'prompts', 'source', "TEXT DEFAULT 'generated'");
  ensureColumn(db, 'prompts', 'saved', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'prompts', 'created_at', 'TEXT');
  ensureColumn(db, 'prompts', 'last_used_at', 'TEXT');
  ensureColumn(db, 'error_tally', 'user_id', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, 'sentence_lab_drafts', 'user_id', "TEXT NOT NULL DEFAULT 'local'");
  rebuildVocabIfLegacy(db);
  rebuildErrorTallyIfLegacy(db);
  ensureColumn(db, 'vocab', 'ease', "TEXT DEFAULT 'new' CHECK(ease IN ('new','hard','easy'))");
  ensureColumn(db, 'vocab', 'last_reviewed', 'TEXT');
  ensureColumn(db, 'vocab', 'word_family', 'TEXT');
  ensureColumn(db, 'vocab', 'near_synonyms', 'TEXT');
  ensureColumn(db, 'vocab', 'base_form', 'TEXT');
  ensureColumn(db, 'vocab', 'source_title', 'TEXT');
  ensureColumn(db, 'vocab', 'source_url', 'TEXT');
  db.prepare(`
    UPDATE vocab
    SET base_form = normalized
    WHERE base_form IS NULL OR trim(base_form) = ''
  `).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_embeddings (
      session_id INTEGER PRIMARY KEY,
      user_id    TEXT NOT NULL,
      content    TEXT NOT NULL,
      embedding  TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  ensureColumn(db, 'annotations', 'rule', 'TEXT');
  ensureColumn(db, 'annotations', 'rule_example', 'TEXT');
  ensureColumn(db, 'vocab', 'sm2_interval', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'vocab', 'sm2_ease', 'REAL DEFAULT 2.5');
  ensureColumn(db, 'vocab', 'sm2_reps', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'vocab', 'next_review_at', 'TEXT');
  ensureColumn(db, 'vocab', 'graduated', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'vocab', 'graduated_at', 'TEXT');
  ensureColumn(db, 'vocab', 'last_suggested_at', 'TEXT');
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function tableSql(db: Database.Database, table: string): string {
  const row = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table) as { sql: string } | undefined;
  return row?.sql ?? '';
}

function rebuildVocabIfLegacy(db: Database.Database) {
  if (tableSql(db, 'vocab').includes('UNIQUE(user_id, normalized)')) return;
  db.exec(`
    CREATE TABLE vocab_new (
      id INTEGER PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'local',
      word TEXT NOT NULL, normalized TEXT NOT NULL, base_form TEXT,
      kind TEXT NOT NULL DEFAULT 'word', ipa TEXT, def_cn TEXT, pos TEXT,
      status TEXT, source TEXT, context_sentence TEXT, examples TEXT,
      collocations TEXT, register TEXT, capture_count INTEGER DEFAULT 1,
      last_captured TEXT DEFAULT (datetime('now')), date_added TEXT DEFAULT (datetime('now')),
      times_suggested INTEGER DEFAULT 0, times_used INTEGER DEFAULT 0,
      UNIQUE(user_id, normalized)
    );
    INSERT INTO vocab_new (
      id, user_id, word, normalized, base_form, kind, ipa, def_cn, pos, status, source,
      context_sentence, examples, collocations, register, capture_count,
      last_captured, date_added, times_suggested, times_used
    )
    SELECT
      id, COALESCE(user_id, 'local'), word, normalized, normalized, kind, ipa, def_cn, pos, status, source,
      context_sentence, examples, collocations, register, capture_count,
      last_captured, date_added, times_suggested, times_used
    FROM vocab;
    DROP TABLE vocab;
    ALTER TABLE vocab_new RENAME TO vocab;
  `);
}

function rebuildErrorTallyIfLegacy(db: Database.Database) {
  if (tableSql(db, 'error_tally').includes('PRIMARY KEY (user_id, error_type)')) return;
  db.exec(`
    CREATE TABLE error_tally_new (
      user_id TEXT NOT NULL DEFAULT 'local',
      error_type TEXT NOT NULL, count INTEGER DEFAULT 0, last_seen TEXT,
      PRIMARY KEY (user_id, error_type)
    );
    INSERT INTO error_tally_new (user_id, error_type, count, last_seen)
    SELECT COALESCE(user_id, 'local'), error_type, count, last_seen
    FROM error_tally;
    DROP TABLE error_tally;
    ALTER TABLE error_tally_new RENAME TO error_tally;
  `);
}
