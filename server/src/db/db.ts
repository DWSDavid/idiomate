import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path = config.dbPath) {
  return new Database(path);
}

export function migrate(db: Database.Database) {
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  ensureColumn(db, 'annotations', 'rule', 'TEXT');
  ensureColumn(db, 'annotations', 'rule_example', 'TEXT');
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
