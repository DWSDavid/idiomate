CREATE TABLE IF NOT EXISTS vocab (
  id INTEGER PRIMARY KEY, word TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'word', ipa TEXT, def_cn TEXT, pos TEXT,
  status TEXT, source TEXT, context_sentence TEXT, examples TEXT,
  collocations TEXT, register TEXT, capture_count INTEGER DEFAULT 1,
  last_captured TEXT DEFAULT (datetime('now')), date_added TEXT DEFAULT (datetime('now')),
  times_suggested INTEGER DEFAULT 0, times_used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, date TEXT, theme TEXT, text TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, date TEXT, prompt_id INTEGER, draft_text TEXT,
  final_text TEXT, duration_s INTEGER);
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY, session_id INTEGER, paragraph_idx INTEGER, span_text TEXT,
  error_type TEXT, hint TEXT, explanation TEXT, model_rewrite TEXT,
  user_rewrite TEXT, accepted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS error_tally (
  error_type TEXT PRIMARY KEY, count INTEGER DEFAULT 0, last_seen TEXT);
