import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path = join(here, '../../idiomate.sqlite')) {
  return new Database(path);
}

export function migrate(db: Database.Database) {
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
}
