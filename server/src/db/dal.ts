import type Database from 'better-sqlite3';
import type {
  Annotation,
  ErrorTally,
  ErrorType,
  MistakeExample,
  MistakeLogItem,
  MistakeRankingItem,
  MistakeTrendSeries,
  ProgressDailyPoint,
  Vocab,
  VocabKind,
  VocabListItem,
} from '../../../shared/types.js';

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

interface StoredAnnotationRow {
  error_type: ErrorType;
  model_rewrite: string | null;
  accepted: number;
}

interface MistakeLogRow {
  error_type: ErrorType;
  span_text: string;
  user_rewrite: string | null;
  rule: string | null;
  date: string | null;
  annotation_id: number;
}

interface DailyMistakeCountRow {
  date: string;
  count: number;
}

interface TrendTypeRow {
  error_type: ErrorType;
  count: number;
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

export interface ParagraphResultInput {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
  paragraph: string;
  rewrite: string;
  annotations: Array<Omit<InsertAnnotationInput, 'paragraphIdx' | 'userRewrite'> & {
    paragraphIdx?: number;
    userRewrite?: string;
  }>;
}

export interface ParagraphResultRecord {
  sessionId: number;
  created: boolean;
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

function mapVocabListItem(row: VocabRow): VocabListItem {
  return {
    word: row.word,
    kind: row.kind,
    defCn: row.def_cn ?? undefined,
    captureCount: row.capture_count,
    timesSuggested: row.times_suggested,
    timesUsed: row.times_used,
    lastCaptured: row.last_captured ?? undefined,
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

const VOCAB_PRIORITY_SCORE_SQL = `
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
  )
`;

const VOCAB_PRIORITY_ORDER_SQL = `
  priority_score DESC,
  capture_count DESC,
  times_used ASC,
  last_captured DESC,
  normalized ASC
`;

export function getPrimeCandidates(db: Database.Database, n: number): Vocab[] {
  const rows = db.prepare(`
    SELECT *, ${VOCAB_PRIORITY_SCORE_SQL} AS priority_score
    FROM vocab
    ORDER BY ${VOCAB_PRIORITY_ORDER_SQL}
    LIMIT ?
  `).all(n) as VocabRow[];
  return rows.map(mapVocab);
}

export function getVocabList(db: Database.Database, limit = 200): VocabListItem[] {
  const safeLimit = boundedPositiveInt(limit, 200, 500);
  const rows = db.prepare(`
    SELECT *, ${VOCAB_PRIORITY_SCORE_SQL} AS priority_score
    FROM vocab
    ORDER BY ${VOCAB_PRIORITY_ORDER_SQL}
    LIMIT ?
  `).all(safeLimit) as VocabRow[];
  return rows.map(mapVocabListItem);
}

export function getVocabCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM vocab').get() as { count: number };
  return row.count;
}

export function getVocabCaptureMeta(
  db: Database.Database,
  wordOrNormalized: string,
): { id: number; captureCount: number } | undefined {
  const row = db.prepare(`
    SELECT id, capture_count
    FROM vocab
    WHERE normalized = ?
  `).get(normalizeVocabWord(wordOrNormalized)) as { id: number; capture_count: number } | undefined;
  if (!row) return undefined;
  return { id: row.id, captureCount: row.capture_count };
}

const PRIME_STOPWORDS = new Set([
  'what', 'your', 'view', 'the', 'and', 'for', 'that', 'with', 'this', 'from', 'their', 'should',
  'about', 'how', 'are', 'you', 'consider', 'discuss', 'between', 'such', 'whether', 'these', 'those',
  'where', 'while', 'might', 'each', 'they', 'have', 'has', 'its', 'into', 'over', 'under', 'when',
  'which', 'who', 'because', 'would', 'could', 'will', 'them', 'then', 'than', 'some', 'more', 'most',
  'also', 'been', 'being', 'other', 'there', 'here', 'make', 'made', 'like', 'just', 'very', 'much',
]);

function keywordsFromText(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return Array.from(new Set(words)).filter(w => !PRIME_STOPWORDS.has(w)).slice(0, 14);
}

/**
 * Build a candidate pool for topic-fit priming. Blends:
 *  1. topical lexical matches - vocab whose word/def/examples/collocations contain a prompt keyword
 *  2. memory                  - priority (frequent/recent/phrase) + oldest unused
 *  3. coverage                - random sample, so relevant words exist even when scores tie
 * The LLM then ranks this pool down to the final set.
 */
export function getPrimeCandidatePool(db: Database.Database, promptText = '', n = 120): Vocab[] {
  const limit = Math.max(1, n);
  const byNormalized = new Map<string, Vocab>();
  const add = (items: Vocab[]) => {
    for (const item of items) {
      const key = normalizeVocabWord(item.normalized ?? item.word);
      if (!byNormalized.has(key)) byNormalized.set(key, item);
    }
  };

  // 1. Topical lexical matches (keywords against word + Chinese gloss + examples/collocations).
  const keywords = keywordsFromText(promptText);
  if (keywords.length) {
    const clause = keywords
      .map(() => '(word LIKE ? OR def_cn LIKE ? OR examples LIKE ? OR collocations LIKE ?)')
      .join(' OR ');
    const params: string[] = [];
    for (const keyword of keywords) {
      const like = `%${keyword}%`;
      params.push(like, like, like, like);
    }
    const rows = db
      .prepare(`SELECT * FROM vocab WHERE ${clause} ORDER BY times_used ASC, capture_count DESC LIMIT 60`)
      .all(...params) as VocabRow[];
    add(rows.map(mapVocab));
  }

  // 2. Memory blend: priority + oldest unused, proportional so old words keep a guaranteed slot.
  const priorityLimit = Math.max(1, Math.ceil(limit * 25 / 40));
  const oldestLimit = Math.max(0, limit - priorityLimit);
  add(getPrimeCandidates(db, priorityLimit));
  if (oldestLimit > 0) {
    const oldest = db
      .prepare('SELECT * FROM vocab WHERE times_used = 0 ORDER BY last_captured ASC, normalized ASC LIMIT ?')
      .all(oldestLimit) as VocabRow[];
    add(oldest.map(mapVocab));
  }

  // 3. Coverage: random fill so topical words can surface even when scores tie.
  if (byNormalized.size < limit) {
    const random = db.prepare('SELECT * FROM vocab ORDER BY RANDOM() LIMIT ?').all(limit * 2) as VocabRow[];
    add(random.map(mapVocab));
  }

  return Array.from(byNormalized.values()).slice(0, limit);
}

export function incrementVocabUsed(db: Database.Database, word: string) {
  db.prepare(`
    UPDATE vocab
    SET times_used = times_used + 1
    WHERE normalized = ?
  `).run(normalizeVocabWord(word));
}

export function decrementVocabUsed(db: Database.Database, word: string) {
  db.prepare(`
    UPDATE vocab
    SET times_used = CASE WHEN times_used > 0 THEN times_used - 1 ELSE 0 END
    WHERE normalized = ?
  `).run(normalizeVocabWord(word));
}

export function incrementVocabSuggested(db: Database.Database, words: string[]) {
  const stmt = db.prepare(`
    UPDATE vocab
    SET times_suggested = times_suggested + 1
    WHERE normalized = ?
  `);
  const incrementMany = db.transaction((items: string[]) => {
    for (const word of items) {
      stmt.run(normalizeVocabWord(word));
    }
  });
  incrementMany(words);
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

function decrementErrors(db: Database.Database, types: ErrorType[]) {
  const decrement = db.prepare(`
    UPDATE error_tally
    SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
    WHERE error_type = ?
  `);
  const deleteEmpty = db.prepare('DELETE FROM error_tally WHERE count <= 0');
  const decrementMany = db.transaction((items: ErrorType[]) => {
    for (const type of items) {
      decrement.run(type);
    }
    deleteEmpty.run();
  });
  decrementMany(types);
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

function mapMistakeRow(row: MistakeLogRow): MistakeLogItem {
  return {
    errorType: row.error_type,
    span: row.span_text,
    userRewrite: row.user_rewrite ?? undefined,
    rule: row.rule ?? undefined,
    date: row.date ?? undefined,
  };
}

export function getMistakeLog(
  db: Database.Database,
  errorType?: ErrorType,
  limit = 50,
): MistakeLogItem[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 200));
  const rows = db.prepare(`
    SELECT
      annotations.id AS annotation_id,
      annotations.error_type,
      annotations.span_text,
      annotations.user_rewrite,
      annotations.rule,
      sessions.date
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE annotations.error_type != 'vocab_suggestion'
      AND (@errorType IS NULL OR annotations.error_type = @errorType)
    ORDER BY sessions.date DESC, annotations.id DESC
    LIMIT @limit
  `).all({ errorType: errorType ?? null, limit: safeLimit }) as MistakeLogRow[];
  return rows.map(mapMistakeRow);
}

export function getMistakeRanking(db: Database.Database): MistakeRankingItem[] {
  return getTallies(db).map(tally => {
    const recentExamples: MistakeExample[] = getMistakeLog(db, tally.errorType, 3)
      .map(({ errorType: _errorType, ...example }) => example);
    return {
      errorType: tally.errorType,
      count: tally.count,
      lastSeen: tally.lastSeen,
      recentExamples,
    };
  });
}

function boundedPositiveInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value), max));
}

function daysParam(days: number): { startOffset: string } {
  const safeDays = boundedPositiveInt(days, 30, 365);
  return { startOffset: `-${safeDays - 1} days` };
}

export function getDailyMistakeCounts(db: Database.Database, days = 30): ProgressDailyPoint[] {
  const rows = db.prepare(`
    SELECT date(sessions.date) AS date, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE annotations.error_type != 'vocab_suggestion'
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY date(sessions.date)
    ORDER BY date ASC
  `).all(daysParam(days)) as DailyMistakeCountRow[];
  return rows.map(row => ({
    date: row.date,
    count: row.count,
  }));
}

export function getMistakeTrend(db: Database.Database, days = 30, topN = 3): MistakeTrendSeries[] {
  const window = daysParam(days);
  const safeTopN = boundedPositiveInt(topN, 3, 10);
  const topTypes = db.prepare(`
    SELECT annotations.error_type, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE annotations.error_type != 'vocab_suggestion'
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY annotations.error_type
    ORDER BY count DESC, annotations.error_type ASC
    LIMIT @limit
  `).all({ ...window, limit: safeTopN }) as TrendTypeRow[];

  const pointsForType = db.prepare(`
    SELECT date(sessions.date) AS date, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE annotations.error_type = @errorType
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY date(sessions.date)
    ORDER BY date ASC
  `);

  return topTypes.map(type => ({
    errorType: type.error_type,
    points: (pointsForType.all({
      errorType: type.error_type,
      ...window,
    }) as DailyMistakeCountRow[]).map(row => ({
      date: row.date,
      count: row.count,
    })),
  }));
}

export function getActivationStats(db: Database.Database): { suggested: number; used: number } {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(times_suggested), 0) AS suggested,
      COALESCE(SUM(times_used), 0) AS used
    FROM vocab
  `).get() as { suggested: number; used: number };
  return row;
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

function sessionDay(date?: string): string {
  return date?.trim() || new Date().toISOString().slice(0, 10);
}

function findSessionForDay(db: Database.Database, date: string, promptId?: number): number | undefined {
  const row = db.prepare(`
    SELECT id
    FROM sessions
    WHERE date = @date
      AND (
        (@promptId IS NULL AND prompt_id IS NULL)
        OR prompt_id = @promptId
      )
    ORDER BY id ASC
    LIMIT 1
  `).get({ date, promptId: promptId ?? null }) as { id: number } | undefined;
  return row?.id;
}

function getOrCreateParagraphSession(db: Database.Database, input: ParagraphResultInput): ParagraphResultRecord {
  const date = sessionDay(input.date);
  const existing = findSessionForDay(db, date, input.promptId);
  if (existing) {
    db.prepare(`
      UPDATE sessions
      SET draft_text = CASE
          WHEN draft_text IS NULL OR draft_text = '' THEN @paragraph
          ELSE draft_text
        END
      WHERE id = @id
    `).run({ id: existing, paragraph: input.paragraph });
    return { sessionId: existing, created: false };
  }

  const sessionId = insertSession(db, {
    date,
    promptId: input.promptId,
    draftText: input.paragraph,
  });
  return { sessionId, created: true };
}

function tallyErrorTypes(rows: StoredAnnotationRow[]): ErrorType[] {
  return rows
    .map(row => row.error_type)
    .filter(errorType => errorType !== 'vocab_suggestion');
}

function acceptedVocabWords(rows: StoredAnnotationRow[]): string[] {
  return rows
    .filter(row => row.error_type === 'vocab_suggestion' && row.accepted === 1)
    .map(row => row.model_rewrite)
    .filter((word): word is string => Boolean(word?.trim()));
}

function submittedErrorTypes(annotations: InsertAnnotationInput[]): ErrorType[] {
  return annotations
    .map(annotation => annotation.errorType)
    .filter(errorType => errorType !== 'vocab_suggestion');
}

function submittedVocabWords(annotations: InsertAnnotationInput[]): string[] {
  return annotations
    .filter(annotation => annotation.errorType === 'vocab_suggestion' && annotation.accepted)
    .map(annotation => annotation.vocabWord ?? annotation.modelRewrite)
    .filter((word): word is string => Boolean(word?.trim()));
}

export function insertAnnotations(
  db: Database.Database,
  sessionId: number,
  annotations: InsertAnnotationInput[],
) {
  const stmt = db.prepare(`
    INSERT INTO annotations (
      session_id, paragraph_idx, span_text, error_type, hint, explanation,
      model_rewrite, rule, rule_example, user_rewrite, accepted
    )
    VALUES (
      @sessionId, @paragraphIdx, @span, @errorType, @hint, @explanation,
      @modelRewrite, @rule, @ruleExample, @userRewrite, @accepted
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
        rule: item.rule ?? null,
        ruleExample: item.ruleExample ? JSON.stringify(item.ruleExample) : null,
        userRewrite: item.userRewrite ?? null,
        accepted: item.accepted ? 1 : 0,
      });
    }
  });
  insertMany(annotations);
}

export function recordParagraphResult(
  db: Database.Database,
  input: ParagraphResultInput,
): ParagraphResultRecord {
  const applyResult = db.transaction(() => {
    const session = getOrCreateParagraphSession(db, input);
    const previous = db.prepare(`
      SELECT error_type, model_rewrite, accepted
      FROM annotations
      WHERE session_id = ? AND paragraph_idx = ?
    `).all(session.sessionId, input.paragraphIdx) as StoredAnnotationRow[];

    db.prepare('DELETE FROM annotations WHERE session_id = ? AND paragraph_idx = ?')
      .run(session.sessionId, input.paragraphIdx);

    const nextAnnotations: InsertAnnotationInput[] = input.annotations.map(annotation => ({
      ...annotation,
      paragraphIdx: input.paragraphIdx,
      userRewrite: input.rewrite,
    }));
    insertAnnotations(db, session.sessionId, nextAnnotations);

    decrementErrors(db, tallyErrorTypes(previous));
    recordErrors(db, submittedErrorTypes(nextAnnotations));

    for (const word of acceptedVocabWords(previous)) {
      decrementVocabUsed(db, word);
    }
    for (const word of submittedVocabWords(nextAnnotations)) {
      incrementVocabUsed(db, word);
    }

    return session;
  });

  return applyResult();
}
