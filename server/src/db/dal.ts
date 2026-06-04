import type Database from 'better-sqlite3';
import type { Annotation, ErrorTally, ErrorType, Vocab, VocabKind } from '../../../shared/types.js';

interface VocabRow {
  id: number;
  word: string;
  normalized: string;
  kind: VocabKind;
  ipa: string | null;
  def_cn: string | null;
  pos: string | null;
  status: string | null;
  source: string | null;
  context_sentence: string | null;
  examples: string | null;
  collocations: string | null;
  register: string | null;
  capture_count: number;
  last_captured: string | null;
  times_suggested: number;
  times_used: number;
}

interface ErrorTallyRow {
  error_type: ErrorType;
  count: number;
  last_seen: string;
}

export interface InsertSessionInput {
  date?: string;
  promptId?: number;
  draftText: string;
  finalText?: string;
  durationS?: number;
}

export interface InsertAnnotationInput extends Annotation {
  paragraphIdx: number;
  userRewrite?: string;
  accepted?: boolean;
}

export function normalizeVocabWord(word: string): string {
  return word.toLowerCase().trim().replace(/\s+/g, ' ');
}

function inferVocabKind(word: string): VocabKind {
  return normalizeVocabWord(word).includes(' ') ? 'phrase' : 'word';
}

function toJson(value: string[] | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

function fromJson(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function mapVocab(row: VocabRow): Vocab {
  return {
    id: row.id,
    word: row.word,
    normalized: row.normalized,
    kind: row.kind,
    ipa: row.ipa ?? undefined,
    defCn: row.def_cn ?? undefined,
    pos: row.pos ?? undefined,
    status: row.status ?? undefined,
    source: row.source ?? undefined,
    contextSentence: row.context_sentence ?? undefined,
    examples: fromJson(row.examples),
    collocations: fromJson(row.collocations),
    register: row.register ?? undefined,
    captureCount: row.capture_count,
    lastCaptured: row.last_captured ?? undefined,
    timesSuggested: row.times_suggested,
    timesUsed: row.times_used,
  };
}

function vocabParams(item: Vocab) {
  const normalized = normalizeVocabWord(item.normalized ?? item.word);
  return {
    word: item.word.trim().replace(/\s+/g, ' '),
    normalized,
    kind: item.kind ?? inferVocabKind(item.word),
    ipa: item.ipa ?? null,
    defCn: item.defCn ?? null,
    pos: item.pos ?? null,
    status: item.status ?? null,
    source: item.source ?? null,
    contextSentence: item.contextSentence ?? null,
    examples: toJson(item.examples),
    collocations: toJson(item.collocations),
    register: item.register ?? null,
    captureCount: item.captureCount ?? 1,
    lastCaptured: item.lastCaptured ?? null,
    timesSuggested: item.timesSuggested ?? 0,
    timesUsed: item.timesUsed ?? 0,
  };
}

export function upsertVocab(db: Database.Database, vocab: Vocab): number {
  const stmt = db.prepare(`
    INSERT INTO vocab (
      word, normalized, kind, ipa, def_cn, pos, status, source,
      context_sentence, examples, collocations, register, capture_count,
      last_captured, times_suggested, times_used
    )
    VALUES (
      @word, @normalized, @kind, @ipa, @defCn, @pos, @status, @source,
      @contextSentence, @examples, @collocations, @register, @captureCount,
      COALESCE(@lastCaptured, datetime('now')), @timesSuggested, @timesUsed
    )
    ON CONFLICT(normalized) DO UPDATE SET
      word = excluded.word,
      kind = excluded.kind,
      ipa = COALESCE(excluded.ipa, vocab.ipa),
      def_cn = COALESCE(excluded.def_cn, vocab.def_cn),
      pos = COALESCE(excluded.pos, vocab.pos),
      status = COALESCE(excluded.status, vocab.status),
      source = COALESCE(excluded.source, vocab.source),
      context_sentence = COALESCE(excluded.context_sentence, vocab.context_sentence),
      examples = COALESCE(excluded.examples, vocab.examples),
      collocations = COALESCE(excluded.collocations, vocab.collocations),
      register = COALESCE(excluded.register, vocab.register),
      capture_count = vocab.capture_count + excluded.capture_count,
      last_captured = excluded.last_captured,
      times_suggested = vocab.times_suggested + excluded.times_suggested,
      times_used = vocab.times_used + excluded.times_used
  `);
  const normalized = normalizeVocabWord(vocab.normalized ?? vocab.word);
  stmt.run(vocabParams(vocab));
  const row = db.prepare('SELECT id FROM vocab WHERE normalized = ?').get(normalized) as { id: number };
  return row.id;
}

export function insertVocab(db: Database.Database, vocab: Vocab[]) {
  const insertMany = db.transaction((items: Vocab[]) => {
    for (const item of items) {
      upsertVocab(db, item);
    }
  });
  insertMany(vocab);
}

export function getVocabSample(db: Database.Database, n: number): Vocab[] {
  return getPrimeCandidates(db, n);
}

export function getPrimeCandidates(db: Database.Database, n: number): Vocab[] {
  const rows = db.prepare(`
    SELECT *,
      (
        capture_count * 10
        - times_used * 12
        - times_suggested * 2
        + CASE kind
          WHEN 'collocation' THEN 14
          WHEN 'phrase' THEN 10
          ELSE 0
        END
        + CASE
          WHEN julianday('now') - julianday(last_captured) <= 7 THEN 6
          WHEN julianday('now') - julianday(last_captured) <= 30 THEN 3
          ELSE 0
        END
      ) AS priority_score
    FROM vocab
    ORDER BY priority_score DESC, capture_count DESC, times_used ASC, last_captured DESC, normalized ASC
    LIMIT ?
  `).all(n) as VocabRow[];
  return rows.map(mapVocab);
}

export function incrementVocabUsed(db: Database.Database, word: string) {
  db.prepare(`
    UPDATE vocab
    SET times_used = times_used + 1
    WHERE normalized = ?
  `).run(normalizeVocabWord(word));
}

export function recordErrors(db: Database.Database, types: ErrorType[]) {
  const stmt = db.prepare(`
    INSERT INTO error_tally (error_type, count, last_seen)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(error_type) DO UPDATE SET
      count = count + 1,
      last_seen = datetime('now')
  `);
  const recordMany = db.transaction((items: ErrorType[]) => {
    for (const type of items) {
      stmt.run(type);
    }
  });
  recordMany(types);
}

export function getTallies(db: Database.Database): ErrorTally[] {
  const rows = db
    .prepare('SELECT error_type, count, last_seen FROM error_tally ORDER BY count DESC, error_type ASC')
    .all() as ErrorTallyRow[];
  return rows.map(row => ({
    errorType: row.error_type,
    count: row.count,
    lastSeen: row.last_seen,
  }));
}

export function insertSession(db: Database.Database, input: InsertSessionInput): number {
  const result = db.prepare(`
    INSERT INTO sessions (date, prompt_id, draft_text, final_text, duration_s)
    VALUES (@date, @promptId, @draftText, @finalText, @durationS)
  `).run({
    date: input.date ?? new Date().toISOString(),
    promptId: input.promptId ?? null,
    draftText: input.draftText,
    finalText: input.finalText ?? null,
    durationS: input.durationS ?? null,
  });
  return Number(result.lastInsertRowid);
}

export function insertAnnotations(
  db: Database.Database,
  sessionId: number,
  annotations: InsertAnnotationInput[],
) {
  const stmt = db.prepare(`
    INSERT INTO annotations (
      session_id, paragraph_idx, span_text, error_type, hint, explanation,
      model_rewrite, user_rewrite, accepted
    )
    VALUES (
      @sessionId, @paragraphIdx, @span, @errorType, @hint, @explanation,
      @modelRewrite, @userRewrite, @accepted
    )
  `);
  const insertMany = db.transaction((items: InsertAnnotationInput[]) => {
    for (const item of items) {
      stmt.run({
        sessionId,
        paragraphIdx: item.paragraphIdx,
        span: item.span,
        errorType: item.errorType,
        hint: item.hint,
        explanation: item.explanation,
        modelRewrite: item.modelRewrite,
        userRewrite: item.userRewrite ?? null,
        accepted: item.accepted ? 1 : 0,
      });
    }
  });
  insertMany(annotations);
}
