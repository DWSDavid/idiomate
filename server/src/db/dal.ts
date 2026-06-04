import type Database from 'better-sqlite3';
import type { Annotation, ErrorTally, ErrorType, Vocab } from '../../../shared/types.js';

interface VocabRow {
  id: number;
  word: string;
  ipa: string | null;
  def_cn: string | null;
  pos: string | null;
  status: string | null;
  source: string | null;
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

function mapVocab(row: VocabRow): Vocab {
  return {
    id: row.id,
    word: row.word,
    ipa: row.ipa ?? undefined,
    defCn: row.def_cn ?? undefined,
    pos: row.pos ?? undefined,
    status: row.status ?? undefined,
    source: row.source ?? undefined,
    timesSuggested: row.times_suggested,
    timesUsed: row.times_used,
  };
}

export function insertVocab(db: Database.Database, vocab: Vocab[]) {
  const stmt = db.prepare(`
    INSERT INTO vocab (word, ipa, def_cn, pos, status, source, times_suggested, times_used)
    VALUES (@word, @ipa, @defCn, @pos, @status, @source, @timesSuggested, @timesUsed)
  `);
  const insertMany = db.transaction((items: Vocab[]) => {
    for (const item of items) {
      stmt.run({
        word: item.word,
        ipa: item.ipa ?? null,
        defCn: item.defCn ?? null,
        pos: item.pos ?? null,
        status: item.status ?? null,
        source: item.source ?? null,
        timesSuggested: item.timesSuggested,
        timesUsed: item.timesUsed,
      });
    }
  });
  insertMany(vocab);
}

export function getVocabSample(db: Database.Database, n: number): Vocab[] {
  const rows = db.prepare('SELECT * FROM vocab ORDER BY RANDOM() LIMIT ?').all(n) as VocabRow[];
  return rows.map(mapVocab);
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
