CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'local',
  word TEXT NOT NULL, normalized TEXT NOT NULL,
  base_form TEXT,
  kind TEXT NOT NULL DEFAULT 'word', ipa TEXT, def_cn TEXT, pos TEXT,
  status TEXT, source TEXT, context_sentence TEXT, examples TEXT,
  collocations TEXT, register TEXT, capture_count INTEGER DEFAULT 1,
  last_captured TEXT DEFAULT (datetime('now')), date_added TEXT DEFAULT (datetime('now')),
  times_suggested INTEGER DEFAULT 0, times_used INTEGER DEFAULT 0,
  UNIQUE(user_id, normalized));
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, date TEXT, theme TEXT, text TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'local',
  date TEXT, prompt_id INTEGER, draft_text TEXT,
  final_text TEXT, duration_s INTEGER,
  source TEXT DEFAULT 'daily_writing',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY, session_id INTEGER, paragraph_idx INTEGER, span_text TEXT,
  error_type TEXT, hint TEXT, explanation TEXT, model_rewrite TEXT,
  rule TEXT, rule_example TEXT, user_rewrite TEXT, accepted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS error_tally (
  user_id TEXT NOT NULL DEFAULT 'local',
  error_type TEXT NOT NULL, count INTEGER DEFAULT 0, last_seen TEXT,
  PRIMARY KEY (user_id, error_type));
CREATE TABLE IF NOT EXISTS sentence_lab_drafts (
  id INTEGER PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'local',
  date TEXT, sentence TEXT NOT NULL, context TEXT,
  response_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
