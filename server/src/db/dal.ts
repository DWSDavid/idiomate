import type Database from 'better-sqlite3';
import type { WordDeepDive } from '../brain/schema.js';
import type {
  Annotation,
  AdminUserSummary,
  CoachResponse,
  ErrorTally,
  ErrorType,
  MistakeExample,
  MistakeLogItem,
  MistakeRankingItem,
  MistakeTrendSeries,
  NewsItem,
  Pattern,
  Prompt,
  ProgressDailyPoint,
  SaveVocabResponse,
  SourceQuote,
  Vocab,
  VocabKind,
  VocabListItem,
  WritingHistoryAnnotation,
  WritingHistoryEntry,
  WritingSource,
} from '../../../shared/types.js';

interface VocabRow {
  id: number;
  user_id: string;
  word: string;
  normalized: string;
  base_form: string | null;
  kind: VocabKind;
  ipa: string | null;
  def_cn: string | null;
  pos: string | null;
  status: string | null;
  source: string | null;
  source_title: string | null;
  source_url: string | null;
  context_sentence: string | null;
  examples: string | null;
  collocations: string | null;
  register: string | null;
  capture_count: number;
  last_captured: string | null;
  date_added: string | null;
  times_suggested: number;
  times_used: number;
  ease: 'new' | 'hard' | 'easy' | null;
  last_reviewed: string | null;
  word_family: string | null;
  near_synonyms: string | null;
  sm2_interval: number | null;
  sm2_ease: number | null;
  sm2_reps: number | null;
  next_review_at: string | null;
  graduated: number | null;
  graduated_at: string | null;
}

interface ErrorTallyRow {
  user_id: string;
  error_type: ErrorType;
  count: number;
  last_seen: string;
}

interface SessionEmbeddingRow {
  session_id: number;
  content: string;
  embedding: string;
}

interface EaseCountRow {
  ease: 'new' | 'hard' | 'easy';
  count: number;
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

interface SentenceLabDraftRow {
  id: number;
  user_id: string;
  date: string | null;
  sentence: string;
  context: string | null;
  response_json: string;
  created_at: string | null;
}

interface UserSummaryRow {
  id: string;
  name: string | null;
  created_at: string | null;
  vocab_count: number;
  session_count: number;
  sentence_lab_count: number;
  last_session_at: string | null;
  last_sentence_lab_at: string | null;
  last_vocab_at: string | null;
}

interface HistorySessionRow {
  id: number;
  date: string | null;
  draft_text: string;
  final_text: string | null;
  native_text: string | null;
  elevated_text: string | null;
  evidence_text: string | null;
  source: WritingSource | null;
  created_at: string | null;
  context_label: string | null;
  context_title: string | null;
  context_url: string | null;
  context_excerpt: string | null;
}

interface HistoryAnnotationRow {
  session_id: number;
  span_text: string;
  error_type: ErrorType;
  rule: string | null;
  user_rewrite: string | null;
  accepted: number;
}

interface SentenceLabHistoryAnnotationRow {
  draft_id: number;
  span_text: string;
  error_type: ErrorType;
  rule: string | null;
  user_rewrite: string | null;
  accepted: number;
}

interface PromptRow {
  id: number;
  user_id: string;
  date: string | null;
  theme: string | null;
  text: string | null;
  essay_prompt: string | null;
  source_url: string | null;
  news_items: string | null;
  source_quotes: string | null;
  source: string | null;
  saved: number | null;
  created_at: string | null;
  last_used_at: string | null;
}

export interface InsertSessionInput {
  date?: string;
  promptId?: number;
  draftText: string;
  finalText?: string;
  nativeText?: string;
  elevatedText?: string;
  evidenceText?: string;
  durationS?: number;
  source?: WritingSource;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
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
  nativeText?: string;
  elevatedText?: string;
  evidenceText?: string;
  source?: WritingSource;
  annotations: Array<Omit<InsertAnnotationInput, 'paragraphIdx' | 'userRewrite'> & {
    paragraphIdx?: number;
    userRewrite?: string;
  }>;
}

export interface ParagraphResultRecord {
  sessionId: number;
  created: boolean;
}

export interface SentenceLabDraft {
  id: number;
  date: string;
  sentence: string;
  context?: string;
  response: CoachResponse;
}

export function upsertUser(db: Database.Database, userId: string, name?: string): boolean {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
  const safeName = name?.trim() || null;
  db.prepare(`
    INSERT INTO users (id, name)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(excluded.name, users.name)
  `).run(userId, safeName);
  return !existing;
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

function fromNewsJson(value: string | null): NewsItem[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .map(item => ({
        title: String(item?.title ?? ''),
        link: String(item?.link ?? ''),
        source: item?.source ? String(item.source) : undefined,
      }))
      .filter(item => item.title && item.link);
  } catch {
    return undefined;
  }
}

function fromQuotesJson(value: string | null): SourceQuote[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const quotes = parsed
      .map(item => ({
        quote: String(item?.quote ?? ''),
        source: item?.source ? String(item.source) : undefined,
        link: item?.link ? String(item.link) : undefined,
      }))
      .filter(item => item.quote);
    return quotes.length ? quotes : undefined;
  } catch {
    return undefined;
  }
}

function promptFromRow(row: PromptRow): Prompt {
  return {
    id: row.id,
    date: row.date ?? '',
    theme: row.theme ?? '',
    text: row.text ?? '',
    essayPrompt: row.essay_prompt ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    newsItems: fromNewsJson(row.news_items),
    sourceQuotes: fromQuotesJson(row.source_quotes),
    saved: row.saved === 1,
    createdAt: row.created_at ?? undefined,
    lastUsedAt: row.last_used_at ?? undefined,
    source: row.source ?? undefined,
  };
}

export function insertGeneratedPrompt(
  db: Database.Database,
  userId: string,
  prompt: Omit<Prompt, 'id' | 'saved' | 'createdAt' | 'lastUsedAt'>,
): Prompt {
  const info = db.prepare(`
    INSERT INTO prompts (user_id, date, theme, text, essay_prompt, source_url, news_items, source_quotes, source, saved)
    VALUES (@userId, @date, @theme, @text, @essayPrompt, @sourceUrl, @newsItems, @sourceQuotes, @source, 0)
  `).run({
    userId,
    date: prompt.date,
    theme: prompt.theme,
    text: prompt.text,
    essayPrompt: prompt.essayPrompt ?? null,
    sourceUrl: prompt.sourceUrl ?? null,
    newsItems: prompt.newsItems ? JSON.stringify(prompt.newsItems) : null,
    sourceQuotes: prompt.sourceQuotes?.length ? JSON.stringify(prompt.sourceQuotes) : null,
    source: prompt.source ?? 'generated',
  });
  return getPromptById(db, userId, Number(info.lastInsertRowid))!;
}

export function getPromptById(db: Database.Database, userId: string, id: number): Prompt | undefined {
  const row = db.prepare(`
    SELECT id, user_id, date, theme, text, essay_prompt, source_url, news_items, source_quotes, source, saved, created_at, last_used_at
    FROM prompts
    WHERE id = ? AND user_id = ?
  `).get(id, userId) as PromptRow | undefined;
  return row ? promptFromRow(row) : undefined;
}

export function getPromptLibrary(
  db: Database.Database,
  userId: string,
  opts: { limit?: number; savedOnly?: boolean } = {},
): Prompt[] {
  const safeLimit = Math.max(1, Math.min(100, opts.limit ?? 20));
  const savedFilter = opts.savedOnly ? 'AND saved = 1' : '';
  const rows = db.prepare(`
    SELECT id, user_id, date, theme, text, essay_prompt, source_url, news_items, source_quotes, source, saved, created_at, last_used_at
    FROM prompts
    WHERE user_id = ?
      ${savedFilter}
    ORDER BY
      COALESCE(last_used_at, created_at) DESC,
      id DESC
    LIMIT ?
  `).all(userId, safeLimit) as PromptRow[];
  return rows.map(promptFromRow);
}

export function setPromptSaved(db: Database.Database, userId: string, id: number, saved: boolean): Prompt | undefined {
  db.prepare(`
    UPDATE prompts
    SET saved = ?
    WHERE id = ? AND user_id = ?
  `).run(saved ? 1 : 0, id, userId);
  return getPromptById(db, userId, id);
}

export function markPromptUsed(db: Database.Database, userId: string, id: number): Prompt | undefined {
  db.prepare(`
    UPDATE prompts
    SET last_used_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(id, userId);
  return getPromptById(db, userId, id);
}

function nearSynonymsFromJson(value: string | null): Array<{ word: string; distinction: string }> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .filter((item): item is { word: unknown; distinction: unknown } => (
        item && typeof item === 'object' && 'word' in item && 'distinction' in item
      ))
      .map(item => ({ word: String(item.word), distinction: String(item.distinction) }));
  } catch {
    return undefined;
  }
}

function mapVocab(row: VocabRow): Vocab {
  return {
    id: row.id,
    word: row.word,
    normalized: row.normalized,
    baseForm: row.base_form ?? undefined,
    kind: row.kind,
    ipa: row.ipa ?? undefined,
    defCn: row.def_cn ?? undefined,
    pos: row.pos ?? undefined,
    status: row.status ?? undefined,
    source: row.source ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    contextSentence: row.context_sentence ?? undefined,
    examples: fromJson(row.examples),
    collocations: fromJson(row.collocations),
    register: row.register ?? undefined,
    captureCount: row.capture_count,
    lastCaptured: row.last_captured ?? undefined,
    ease: row.ease ?? 'new',
    lastReviewed: row.last_reviewed ?? undefined,
    wordFamily: fromJson(row.word_family),
    nearSynonyms: nearSynonymsFromJson(row.near_synonyms),
    timesSuggested: row.times_suggested,
    timesUsed: row.times_used,
    sm2Interval: row.sm2_interval ?? undefined,
    sm2Ease: row.sm2_ease ?? undefined,
    sm2Reps: row.sm2_reps ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    graduated: row.graduated === 1 ? true : undefined,
    graduatedAt: row.graduated_at ?? undefined,
  };
}

function mapVocabListItem(row: VocabRow): VocabListItem {
  const capturedAt = row.source === 'youdao'
    ? undefined
    : row.last_captured ?? row.date_added ?? undefined;
  const nearSynonyms = nearSynonymsFromJson(row.near_synonyms);
  return {
    id: row.id,
    word: row.word,
    kind: row.kind,
    defCn: row.def_cn ?? undefined,
    ...(row.pos ? { pos: row.pos } : {}),
    ...(nearSynonyms?.length ? { nearSynonyms } : {}),
    captureCount: row.capture_count,
    timesSuggested: row.times_suggested,
    timesUsed: row.times_used,
    lastCaptured: capturedAt,
    capturedDate: capturedAt?.slice(0, 10),
    ...(row.graduated === 1 ? { graduated: true as const } : {}),
    nextReviewAt: row.next_review_at ?? undefined,
    dateAdded: row.date_added ?? undefined,
    source: row.source ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    contextSentence: row.context_sentence ?? undefined,
    examples: fromJson(row.examples),
  };
}

function websiteUrlFromContext(context: string | undefined): string | undefined {
  const rawUrl = context?.match(/https?:\/\/[^\s|]+/)?.[0]?.replace(/[),.;:]+$/, '');
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}

function websiteTitleFromContext(context: string | undefined): string | undefined {
  const title = context?.match(/^From\s+(.+?):\s+https?:\/\//)?.[1]?.trim();
  return title || undefined;
}

function vocabParams(userId: string, item: Vocab) {
  const rawNormalized = normalizeVocabWord(item.normalized ?? item.word);
  const baseForm = item.baseForm?.trim()
    ? normalizeVocabWord(item.baseForm)
    : rawNormalized;
  const kind = item.kind ?? inferVocabKind(item.word);
  const storeAsBase = kind === 'word' && baseForm !== rawNormalized;
  const normalized = storeAsBase ? baseForm : rawNormalized;
  const inferredWebsiteUrl = item.sourceUrl ?? websiteUrlFromContext(item.contextSentence);
  const inferredWebsiteTitle = item.sourceTitle ?? websiteTitleFromContext(item.contextSentence);
  const isWebsiteSource = item.source === 'website_reading' || Boolean(inferredWebsiteUrl);
  return {
    userId,
    word: storeAsBase ? baseForm : item.word.trim().replace(/\s+/g, ' '),
    normalized,
    baseForm,
    kind,
    ipa: item.ipa ?? null,
    defCn: item.defCn ?? null,
    pos: item.pos ?? null,
    status: item.status ?? null,
    source: isWebsiteSource ? 'website_reading' : item.source ?? null,
    sourceTitle: inferredWebsiteTitle ?? null,
    sourceUrl: inferredWebsiteUrl ?? null,
    contextSentence: item.contextSentence ?? null,
    examples: toJson(item.examples),
    collocations: toJson(item.collocations),
    register: item.register ?? null,
    captureCount: item.captureCount ?? 1,
    lastCaptured: item.lastCaptured ?? null,
    ease: item.ease ?? 'new',
    lastReviewed: item.lastReviewed ?? null,
    wordFamily: toJson(item.wordFamily),
    nearSynonyms: item.nearSynonyms ? JSON.stringify(item.nearSynonyms) : null,
    timesSuggested: item.timesSuggested ?? 0,
    timesUsed: item.timesUsed ?? 0,
  };
}

function vocabStorageNormalized(item: Vocab): string {
  const rawNormalized = normalizeVocabWord(item.normalized ?? item.word);
  const baseForm = item.baseForm?.trim()
    ? normalizeVocabWord(item.baseForm)
    : rawNormalized;
  const kind = item.kind ?? inferVocabKind(item.word);
  return kind === 'word' && baseForm !== rawNormalized ? baseForm : rawNormalized;
}

function runVocabUpsert(db: Database.Database, params: ReturnType<typeof vocabParams>): number {
  const stmt = db.prepare(`
    INSERT INTO vocab (
      user_id, word, normalized, base_form, kind, ipa, def_cn, pos, status, source,
      source_title, source_url, context_sentence, examples, collocations, register, capture_count,
      last_captured, times_suggested, times_used, ease, last_reviewed,
      word_family, near_synonyms
    )
    VALUES (
      @userId, @word, @normalized, @baseForm, @kind, @ipa, @defCn, @pos, @status, @source,
      @sourceTitle, @sourceUrl, @contextSentence, @examples, @collocations, @register, @captureCount,
      COALESCE(@lastCaptured, datetime('now')), @timesSuggested, @timesUsed, @ease,
      @lastReviewed, @wordFamily, @nearSynonyms
    )
    ON CONFLICT(user_id, normalized) DO UPDATE SET
      word = excluded.word,
      base_form = COALESCE(excluded.base_form, vocab.base_form),
      kind = excluded.kind,
      ipa = COALESCE(excluded.ipa, vocab.ipa),
      def_cn = COALESCE(excluded.def_cn, vocab.def_cn),
      pos = COALESCE(excluded.pos, vocab.pos),
      status = COALESCE(excluded.status, vocab.status),
      source = COALESCE(excluded.source, vocab.source),
      source_title = COALESCE(excluded.source_title, vocab.source_title),
      source_url = COALESCE(excluded.source_url, vocab.source_url),
      context_sentence = COALESCE(excluded.context_sentence, vocab.context_sentence),
      examples = COALESCE(excluded.examples, vocab.examples),
      collocations = COALESCE(excluded.collocations, vocab.collocations),
      register = COALESCE(excluded.register, vocab.register),
      capture_count = vocab.capture_count + excluded.capture_count,
      last_captured = excluded.last_captured,
      times_suggested = vocab.times_suggested + excluded.times_suggested,
      times_used = vocab.times_used + excluded.times_used,
      ease = excluded.ease,
      last_reviewed = COALESCE(excluded.last_reviewed, vocab.last_reviewed),
      word_family = COALESCE(excluded.word_family, vocab.word_family),
      near_synonyms = COALESCE(excluded.near_synonyms, vocab.near_synonyms)
  `);
  stmt.run(params);
  const row = db.prepare('SELECT id FROM vocab WHERE user_id = ? AND normalized = ?')
    .get(params.userId, params.normalized) as { id: number };
  return row.id;
}

export function upsertVocabWithResult(
  db: Database.Database,
  userId: string,
  vocab: Vocab,
): SaveVocabResponse {
  const params = vocabParams(userId, vocab);
  const existing = db.prepare(`
    SELECT id, word, normalized, base_form, capture_count
    FROM vocab
    WHERE user_id = ? AND normalized = ?
  `).get(userId, params.normalized) as { id: number; word: string; normalized: string; base_form: string | null; capture_count: number } | undefined;

  if (!existing) {
    const familyMatch = db.prepare(`
      SELECT id, word, normalized, base_form, capture_count, last_captured
      FROM vocab
      WHERE user_id = ? AND (base_form = ? OR normalized = ?)
        AND id != COALESCE((SELECT id FROM vocab WHERE user_id = ? AND normalized = ?), -1)
      LIMIT 1
    `).get(
      userId,
      params.baseForm,
      params.baseForm,
      userId,
      params.normalized,
    ) as { id: number; word: string; normalized: string; base_form: string | null; capture_count: number; last_captured: string | null } | undefined;

    if (familyMatch) {
      const captureDelta = params.captureCount;
      db.prepare(`
        UPDATE vocab
        SET capture_count = capture_count + @captureDelta,
            last_captured = datetime('now'),
            source = COALESCE(@source, source),
            source_title = COALESCE(@sourceTitle, source_title),
            source_url = COALESCE(@sourceUrl, source_url),
            context_sentence = COALESCE(@contextSentence, context_sentence),
            examples = COALESCE(@examples, examples),
            collocations = COALESCE(@collocations, collocations),
            word_family = COALESCE(@wordFamily, word_family),
            near_synonyms = COALESCE(@nearSynonyms, near_synonyms)
        WHERE id = @id AND user_id = @userId
      `).run({ ...params, captureDelta, id: familyMatch.id });
      return {
        id: familyMatch.id,
        captureCount: familyMatch.capture_count + captureDelta,
        previousCaptureCount: familyMatch.capture_count,
        captureDelta,
        existed: true,
        canonicalWord: familyMatch.word,
        normalized: familyMatch.normalized,
        baseForm: familyMatch.base_form ?? params.baseForm,
      };
    }
  }

  const id = runVocabUpsert(db, params);
  const row = db.prepare(`
    SELECT word, normalized, base_form, capture_count
    FROM vocab
    WHERE id = ? AND user_id = ?
  `).get(id, userId) as { word: string; normalized: string; base_form: string | null; capture_count: number };
  const previousCaptureCount = existing?.capture_count ?? 0;
  return {
    id,
    captureCount: row.capture_count,
    previousCaptureCount,
    captureDelta: Math.max(0, row.capture_count - previousCaptureCount),
    existed: Boolean(existing),
    canonicalWord: row.word,
    normalized: row.normalized,
    baseForm: row.base_form ?? params.baseForm,
  };
}

export function upsertVocab(db: Database.Database, userId: string, vocab: Vocab): number {
  return upsertVocabWithResult(db, userId, vocab).id;
}

export function insertVocab(db: Database.Database, userId: string, vocab: Vocab[]) {
  const insertMany = db.transaction((items: Vocab[]) => {
    for (const item of items) {
      upsertVocabWithResult(db, userId, item);
    }
  });
  insertMany(vocab);
}

export function insertMissingVocab(db: Database.Database, userId: string, vocab: Vocab[]): number {
  const insertMany = db.transaction((items: Vocab[]) => {
    let inserted = 0;
    const exists = db.prepare('SELECT 1 FROM vocab WHERE user_id = ? AND normalized = ? LIMIT 1');
    for (const item of items) {
      const normalized = vocabStorageNormalized(item);
      if (exists.get(userId, normalized)) {
        continue;
      }

      const saved = upsertVocabWithResult(db, userId, item);
      if (!saved.existed) inserted += 1;
    }
    return inserted;
  });
  return insertMany(vocab);
}

export function getVocabSample(db: Database.Database, userId: string, n: number): Vocab[] {
  return getPrimeCandidates(db, userId, n);
}

const VOCAB_PRIORITY_SCORE_SQL = `
  (
    capture_count * 10
    - times_used * 12
    - times_suggested * 5
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
    + CASE WHEN julianday('now') - julianday(last_suggested_at) < 1 THEN -20 ELSE 0 END
  )
`;

const VOCAB_PRIORITY_ORDER_SQL = `
  priority_score DESC,
  capture_count DESC,
  times_used ASC,
  last_captured DESC,
  normalized ASC
`;

export function getPrimeCandidates(db: Database.Database, userId: string, n: number): Vocab[] {
  const rows = db.prepare(`
    SELECT *, ${VOCAB_PRIORITY_SCORE_SQL} AS priority_score
    FROM vocab
    WHERE user_id = ? AND COALESCE(graduated, 0) = 0
    ORDER BY ${VOCAB_PRIORITY_ORDER_SQL}
    LIMIT ?
  `).all(userId, n) as VocabRow[];
  return rows.map(mapVocab);
}

export function getVocabList(db: Database.Database, userId: string, limit = 200): VocabListItem[] {
  const safeLimit = boundedPositiveInt(limit, 200, 500);
  const rows = db.prepare(`
    SELECT *, 0 AS priority_score
    FROM vocab
    WHERE user_id = ? AND COALESCE(graduated, 0) = 0
    ORDER BY COALESCE(last_captured, date_added) DESC, date_added DESC, id DESC
    LIMIT ?
  `).all(userId, safeLimit) as VocabRow[];
  return rows.map(mapVocabListItem);
}

export function getVocabCount(db: Database.Database, userId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM vocab WHERE user_id = ? AND COALESCE(graduated, 0) = 0').get(userId) as { count: number };
  return row.count;
}

export interface GetAllVocabOpts {
  offset: number;
  limit: number;
  sort: 'date' | 'priority';
  source?: string;
  userIds?: string[];
}

export function getAllVocab(
  db: Database.Database,
  userId: string,
  opts: GetAllVocabOpts,
): { total: number; items: VocabListItem[] } {
  const safeOffset = Math.max(0, Math.trunc(opts.offset));
  const safeLimit = Math.max(1, Math.min(Math.trunc(opts.limit), 500));
  const orderBy = opts.sort === 'date'
    ? 'COALESCE(last_captured, date_added) DESC, date_added DESC, id DESC'
    : `${VOCAB_PRIORITY_ORDER_SQL}`;
  const userIds = Array.from(new Set([userId, ...(opts.userIds ?? [])].filter(Boolean)));
  const userFilter = userIds.length > 1
    ? `user_id IN (${userIds.map(() => '?').join(', ')})`
    : 'user_id = ?';

  const sourceFilter = opts.source === 'website_reading'
    ? `AND (
        source LIKE ?
        OR source_url IS NOT NULL
        OR context_sentence LIKE ?
        OR context_sentence LIKE ?
      )`
    : opts.source
      ? 'AND source LIKE ?'
      : '';
  const sourceParams = opts.source === 'website_reading'
    ? [`${opts.source}%`, 'From %http%', '%https://%']
    : opts.source
      ? [`${opts.source}%`]
      : [];

  const countParams: unknown[] = userIds.length > 1 ? [...userIds] : [userId];
  countParams.push(...sourceParams);

  const countRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vocab
    WHERE ${userFilter}
      AND COALESCE(graduated, 0) = 0
      ${sourceFilter}
  `).get(...countParams) as { count: number };

  const rowParams: unknown[] = userIds.length > 1 ? [...userIds] : [userId];
  rowParams.push(...sourceParams);
  rowParams.push(safeLimit, safeOffset);

  const scoreSelect = opts.sort === 'priority'
    ? `, ${VOCAB_PRIORITY_SCORE_SQL} AS priority_score`
    : ', 0 AS priority_score';

  const rows = db.prepare(`
    SELECT *${scoreSelect}
    FROM vocab
    WHERE ${userFilter}
      AND COALESCE(graduated, 0) = 0
      ${sourceFilter}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...rowParams) as VocabRow[];

  return {
    total: countRow.count,
    items: rows.map(mapVocabListItem),
  };
}

function latestTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs >= bMs ? a : b;
  return a >= b ? a : b;
}

export function mergeVocabFamilies(db: Database.Database, userId: string): { merged: number } {
  const merge = db.transaction(() => {
    const rows = db.prepare(`
      SELECT *
      FROM vocab
      WHERE user_id = ?
      ORDER BY CASE WHEN word_family IS NULL THEN 1 ELSE 0 END, id ASC
    `).all(userId) as VocabRow[];
    const deletedIds = new Set<number>();
    let merged = 0;

    for (const primary of rows) {
      if (deletedIds.has(primary.id)) continue;
      const familyKeys = new Set((fromJson(primary.word_family) ?? []).map(normalizeVocabWord));
      if (!familyKeys.size) continue;

      for (const secondary of rows) {
        if (primary.id === secondary.id || deletedIds.has(secondary.id)) continue;
        const secondaryKeys = [secondary.normalized, secondary.base_form].filter(Boolean) as string[];
        if (!secondaryKeys.some(key => familyKeys.has(normalizeVocabWord(key)))) continue;

        primary.capture_count += secondary.capture_count;
        primary.last_captured = latestTimestamp(primary.last_captured, secondary.last_captured);
        db.prepare(`
          UPDATE vocab
          SET capture_count = ?,
              last_captured = COALESCE(?, last_captured)
          WHERE id = ? AND user_id = ?
        `).run(primary.capture_count, primary.last_captured, primary.id, userId);
        db.prepare('DELETE FROM vocab WHERE id = ? AND user_id = ?').run(secondary.id, userId);
        deletedIds.add(secondary.id);
        merged += 1;
      }
    }

    return { merged };
  });
  return merge();
}

export function getReviewQueue(db: Database.Database, userId: string, limit = 10): Vocab[] {
  const safeLimit = boundedPositiveInt(limit, 10, 100);
  const rows = db.prepare(`
    SELECT *
    FROM vocab
    WHERE user_id = ?
      AND COALESCE(graduated, 0) = 0
      AND (
        next_review_at IS NULL
        OR date(next_review_at) <= date('now')
      )
    ORDER BY
      CASE WHEN next_review_at IS NULL THEN 0 ELSE 1 END ASC,
      next_review_at ASC,
      last_captured DESC
    LIMIT ?
  `).all(userId, safeLimit) as VocabRow[];
  return rows.map(mapVocab);
}

export function graduateVocabWords(
  db: Database.Database,
  userId: string,
  normalizedWords: string[],
): void {
  if (!normalizedWords.length) return;
  const placeholders = normalizedWords.map(() => '?').join(', ');
  db.prepare(`
    UPDATE vocab
    SET graduated = 1,
        graduated_at = datetime('now')
    WHERE user_id = ?
      AND normalized IN (${placeholders})
      AND COALESCE(graduated, 0) = 0
  `).run(userId, ...normalizedWords);
}

export function getGraduatedVocab(db: Database.Database, userId: string): VocabListItem[] {
  const rows = db.prepare(`
    SELECT *, 0 AS priority_score
    FROM vocab
    WHERE user_id = ? AND COALESCE(graduated, 0) = 1
    ORDER BY graduated_at DESC
    LIMIT 200
  `).all(userId) as VocabRow[];
  return rows.map(mapVocabListItem);
}

export function recordReview(
  db: Database.Database,
  userId: string,
  vocabId: number,
  ease: 'easy' | 'hard',
): void {
  const row = db.prepare(`
    SELECT sm2_interval, sm2_ease, sm2_reps
    FROM vocab WHERE id = ? AND user_id = ?
  `).get(vocabId, userId) as { sm2_interval: number | null; sm2_ease: number | null; sm2_reps: number | null } | undefined;

  if (!row) return;

  const quality = ease === 'easy' ? 5 : 2;
  const prevInterval = row.sm2_interval ?? 1;
  const prevEase = row.sm2_ease ?? 2.5;
  const prevReps = row.sm2_reps ?? 0;

  const newEase = Math.max(1.3, prevEase + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  let newInterval: number;
  let newReps: number;
  if (quality >= 3) {
    if (prevReps === 0) newInterval = 1;
    else if (prevReps === 1) newInterval = 6;
    else newInterval = Math.round(prevInterval * prevEase);
    newReps = prevReps + 1;
  } else {
    newInterval = 1;
    newReps = 0;
  }

  db.prepare(`
    UPDATE vocab
    SET ease = ?,
        last_reviewed = datetime('now'),
        sm2_interval = ?,
        sm2_ease = ?,
        sm2_reps = ?,
        next_review_at = date('now', ? || ' days')
    WHERE id = ? AND user_id = ?
  `).run(ease, newInterval, newEase, newReps, String(newInterval), vocabId, userId);
}

export function saveDeepDive(
  db: Database.Database,
  userId: string,
  vocabId: number,
  dive: WordDeepDive,
): void {
  db.prepare(`
    UPDATE vocab
    SET word_family = ?, near_synonyms = ?
    WHERE id = ? AND user_id = ?
  `).run(
    JSON.stringify(dive.wordFamily),
    JSON.stringify(dive.nearSynonyms ?? []),
    vocabId,
    userId,
  );
}

export function getDeepDiveCache(
  db: Database.Database,
  userId: string,
  vocabId: number,
): (WordDeepDive & { usageExamples: string[] }) | null {
  const row = db.prepare(`
    SELECT word_family, near_synonyms, examples
    FROM vocab
    WHERE id = ? AND user_id = ?
  `).get(vocabId, userId) as Pick<VocabRow, 'word_family' | 'near_synonyms' | 'examples'> | undefined;
  if (!row?.word_family) return null;
  return {
    wordFamily: fromJson(row.word_family) ?? [],
    nearSynonyms: nearSynonymsFromJson(row.near_synonyms) ?? [],
    usageExamples: fromJson(row.examples) ?? [],
  };
}

export function upsertSessionEmbedding(
  db: Database.Database,
  sessionId: number,
  userId: string,
  content: string,
  embedding: number[],
): void {
  db.prepare(`
    INSERT INTO session_embeddings (session_id, user_id, content, embedding)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      user_id = excluded.user_id,
      content = excluded.content,
      embedding = excluded.embedding
  `).run(sessionId, userId, content, JSON.stringify(embedding));
}

export function getSessionEmbeddings(
  db: Database.Database,
  userId: string,
): Array<{ sessionId: number; content: string; embedding: number[] }> {
  const rows = db.prepare(`
    SELECT session_id, content, embedding
    FROM session_embeddings
    WHERE user_id = ?
    ORDER BY created_at DESC, session_id DESC
  `).all(userId) as SessionEmbeddingRow[];
  return rows.map(row => ({
    sessionId: row.session_id,
    content: row.content,
    embedding: JSON.parse(row.embedding) as number[],
  }));
}

export function getTodayVocab(db: Database.Database, userId: string, limit = 20): Vocab[] {
  const safeLimit = boundedPositiveInt(limit, 20, 100);
  const rows = db.prepare(`
    SELECT *
    FROM vocab
    WHERE user_id = ? AND date(last_captured) = date('now')
    ORDER BY last_captured DESC
    LIMIT ?
  `).all(userId, safeLimit) as VocabRow[];
  return rows.map(mapVocab);
}

export function getMemoryProfile(db: Database.Database, userId: string): {
  topWeaknesses: Array<{ errorType: string; count: number }>;
  totalSessions: number;
  sessionEmbeddingsCount: number;
  vocabCount: number;
  vocabByEase: { new: number; hard: number; easy: number };
} {
  const totalSessions = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?')
    .get(userId) as { count: number };
  const sessionEmbeddingsCount = db.prepare('SELECT COUNT(*) AS count FROM session_embeddings WHERE user_id = ?')
    .get(userId) as { count: number };
  const vocabCount = db.prepare('SELECT COUNT(*) AS count FROM vocab WHERE user_id = ?')
    .get(userId) as { count: number };
  const easeRows = db.prepare(`
    SELECT COALESCE(ease, 'new') AS ease, COUNT(*) AS count
    FROM vocab
    WHERE user_id = ?
    GROUP BY COALESCE(ease, 'new')
  `).all(userId) as EaseCountRow[];
  const vocabByEase = { new: 0, hard: 0, easy: 0 };
  for (const row of easeRows) {
    vocabByEase[row.ease] = row.count;
  }

  return {
    topWeaknesses: getTallies(db, userId).slice(0, 5).map(tally => ({
      errorType: tally.errorType,
      count: tally.count,
    })),
    totalSessions: totalSessions.count,
    sessionEmbeddingsCount: sessionEmbeddingsCount.count,
    vocabCount: vocabCount.count,
    vocabByEase,
  };
}

export function getVocabCaptureMeta(
  db: Database.Database,
  userId: string,
  wordOrNormalized: string,
): { id: number; captureCount: number } | undefined {
  const row = db.prepare(`
    SELECT id, capture_count
    FROM vocab
    WHERE user_id = ? AND normalized = ?
  `).get(userId, normalizeVocabWord(wordOrNormalized)) as { id: number; capture_count: number } | undefined;
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

function topicMatchScore(item: Vocab, keywords: string[]): number {
  if (!keywords.length) return 0;
  const word = normalizeVocabWord(item.word);
  const normalized = normalizeVocabWord(item.normalized ?? item.word);
  const defCn = item.defCn?.toLowerCase() ?? '';
  const examples = (item.examples ?? []).join(' ').toLowerCase();
  const collocations = (item.collocations ?? []).join(' ').toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (word === keyword || normalized === keyword) score += 12;
    if (word.includes(keyword) || normalized.includes(keyword)) score += 8;
    if (collocations.includes(keyword)) score += 5;
    if (examples.includes(keyword)) score += 3;
    if (defCn.includes(keyword)) score += 2;
  }
  if (item.kind === 'collocation') score += 2;
  if (item.kind === 'phrase') score += 1;
  return score;
}

/**
 * Build a candidate pool for topic-fit priming. Blends:
 *  1. topical lexical matches - vocab whose word/def/examples/collocations contain a prompt keyword
 *  2. memory                  - priority (frequent/recent/phrase) + oldest unused
 *  3. coverage                - deterministic fill, so tab switches do not reshuffle suggestions
 * The LLM then ranks this pool down to the final set.
 */
export function getPrimeCandidatePool(db: Database.Database, userId: string, promptText = '', n = 120): Vocab[] {
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
      .prepare(`
        SELECT * FROM vocab
        WHERE user_id = ? AND COALESCE(graduated, 0) = 0 AND (${clause})
        ORDER BY times_used ASC, capture_count DESC
        LIMIT 60
      `)
      .all(userId, ...params) as VocabRow[];
    add(rows
      .map(mapVocab)
      .sort((a, b) => {
        const scoreDelta = topicMatchScore(b, keywords) - topicMatchScore(a, keywords);
        if (scoreDelta !== 0) return scoreDelta;
        const usedDelta = (a.timesUsed ?? 0) - (b.timesUsed ?? 0);
        if (usedDelta !== 0) return usedDelta;
        const captureDelta = (b.captureCount ?? 0) - (a.captureCount ?? 0);
        if (captureDelta !== 0) return captureDelta;
        return normalizeVocabWord(a.normalized ?? a.word).localeCompare(normalizeVocabWord(b.normalized ?? b.word));
      }));
  }

  // 2. Memory blend: priority + oldest unused, proportional so old words keep a guaranteed slot.
  const priorityLimit = Math.max(1, Math.ceil(limit * 25 / 40));
  const oldestLimit = Math.max(0, limit - priorityLimit);
  add(getPrimeCandidates(db, userId, priorityLimit));
  if (oldestLimit > 0) {
    const oldest = db
      .prepare(`
        SELECT * FROM vocab
        WHERE user_id = ? AND COALESCE(graduated, 0) = 0 AND times_used = 0
        ORDER BY last_captured ASC, normalized ASC
        LIMIT ?
      `)
      .all(userId, oldestLimit) as VocabRow[];
    add(oldest.map(mapVocab));
  }

  // 3. Coverage: stable fill for breadth without changing every time the tab remounts.
  if (byNormalized.size < limit) {
    const coverage = db.prepare(`
      SELECT * FROM vocab
      WHERE user_id = ? AND COALESCE(graduated, 0) = 0
      ORDER BY capture_count DESC, times_used ASC, times_suggested ASC, last_captured DESC, normalized ASC
      LIMIT ?
    `)
      .all(userId, limit * 2) as VocabRow[];
    add(coverage.map(mapVocab));
  }

  return Array.from(byNormalized.values()).slice(0, limit);
}

export function incrementVocabUsed(db: Database.Database, userId: string, word: string) {
  db.prepare(`
    UPDATE vocab
    SET times_used = times_used + 1
    WHERE user_id = ? AND normalized = ?
  `).run(userId, normalizeVocabWord(word));
}

export function decrementVocabUsed(db: Database.Database, userId: string, word: string) {
  db.prepare(`
    UPDATE vocab
    SET times_used = CASE WHEN times_used > 0 THEN times_used - 1 ELSE 0 END
    WHERE user_id = ? AND normalized = ?
  `).run(userId, normalizeVocabWord(word));
}

export function incrementVocabSuggested(db: Database.Database, userId: string, words: string[]) {
  const stmt = db.prepare(`
    UPDATE vocab
    SET times_suggested = times_suggested + 1,
        last_suggested_at = datetime('now')
    WHERE user_id = ? AND normalized = ?
  `);
  const incrementMany = db.transaction((items: string[]) => {
    for (const word of items) {
      stmt.run(userId, normalizeVocabWord(word));
    }
  });
  incrementMany(words);
}

export function recordErrors(db: Database.Database, userId: string, types: ErrorType[]) {
  const stmt = db.prepare(`
    INSERT INTO error_tally (user_id, error_type, count, last_seen)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, error_type) DO UPDATE SET
      count = count + 1,
      last_seen = datetime('now')
  `);
  const recordMany = db.transaction((items: ErrorType[]) => {
    for (const type of items) {
      stmt.run(userId, type);
    }
  });
  recordMany(types);
}

function decrementErrors(db: Database.Database, userId: string, types: ErrorType[]) {
  const decrement = db.prepare(`
    UPDATE error_tally
    SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
    WHERE user_id = ? AND error_type = ?
  `);
  const deleteEmpty = db.prepare('DELETE FROM error_tally WHERE user_id = ? AND count <= 0');
  const decrementMany = db.transaction((items: ErrorType[]) => {
    for (const type of items) {
      decrement.run(userId, type);
    }
    deleteEmpty.run(userId);
  });
  decrementMany(types);
}

export function getTallies(db: Database.Database, userId: string): ErrorTally[] {
  const rows = db
    .prepare(`
      SELECT user_id, error_type, count, last_seen
      FROM error_tally
      WHERE user_id = ?
      ORDER BY count DESC, error_type ASC
    `)
    .all(userId) as ErrorTallyRow[];
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
  userId: string,
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
    WHERE sessions.user_id = @userId
      AND annotations.error_type != 'vocab_suggestion'
      AND (@errorType IS NULL OR annotations.error_type = @errorType)
    ORDER BY sessions.date DESC, annotations.id DESC
    LIMIT @limit
  `).all({ userId, errorType: errorType ?? null, limit: safeLimit }) as MistakeLogRow[];
  return rows.map(mapMistakeRow);
}

export function getMistakeRanking(db: Database.Database, userId: string): MistakeRankingItem[] {
  return getTallies(db, userId).map(tally => {
    const recentExamples: MistakeExample[] = getMistakeLog(db, userId, tally.errorType, 3)
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

export function getWritingActivityDays(db: Database.Database, userId: string, days = 90): string[] {
  const safeDays = boundedPositiveInt(days, 90, 365);
  const rows = db.prepare(`
    SELECT DISTINCT date(COALESCE(created_at, date)) AS day
    FROM sessions
    WHERE user_id = ?
      AND date(COALESCE(created_at, date)) >= date('now', ?)
    ORDER BY day ASC
  `).all(userId, `-${safeDays - 1} days`) as Array<{ day: string }>;
  return rows.map(r => r.day);
}

export function getWritingStreak(db: Database.Database, userId: string): { currentStreak: number; longestStreak: number; lastActiveDate?: string } {
  const rows = db.prepare(`
    SELECT DISTINCT date(COALESCE(created_at, date)) AS day
    FROM sessions
    WHERE user_id = ?
    ORDER BY day DESC
  `).all(userId) as Array<{ day: string }>;

  if (!rows.length) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastActiveDate = rows[0].day;

  // streak only continues if last activity was today or yesterday
  let currentStreak = 0;
  if (lastActiveDate === today || lastActiveDate === yesterday) {
    let cursor = new Date(lastActiveDate);
    for (const row of rows) {
      const rowDate = row.day;
      const expected = cursor.toISOString().slice(0, 10);
      if (rowDate === expected) {
        currentStreak += 1;
        cursor = new Date(cursor.getTime() - 86400000);
      } else {
        break;
      }
    }
  }

  // compute longest streak across all history
  let longestStreak = 0;
  let runLength = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].day).getTime();
    const curr = new Date(rows[i].day).getTime();
    if (prev - curr === 86400000) {
      runLength += 1;
    } else {
      longestStreak = Math.max(longestStreak, runLength);
      runLength = 1;
    }
  }
  longestStreak = Math.max(longestStreak, runLength);

  return { currentStreak, longestStreak, lastActiveDate };
}

export function getDailyMistakeCounts(db: Database.Database, userId: string, days = 30): ProgressDailyPoint[] {
  const rows = db.prepare(`
    SELECT date(sessions.date) AS date, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE sessions.user_id = @userId
      AND annotations.error_type != 'vocab_suggestion'
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY date(sessions.date)
    ORDER BY date ASC
  `).all({ userId, ...daysParam(days) }) as DailyMistakeCountRow[];
  return rows.map(row => ({
    date: row.date,
    count: row.count,
  }));
}

export function getMistakeTrend(db: Database.Database, userId: string, days = 30, topN = 3): MistakeTrendSeries[] {
  const window = daysParam(days);
  const safeTopN = boundedPositiveInt(topN, 3, 10);
  const topTypes = db.prepare(`
    SELECT annotations.error_type, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE sessions.user_id = @userId
      AND annotations.error_type != 'vocab_suggestion'
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY annotations.error_type
    ORDER BY count DESC, annotations.error_type ASC
    LIMIT @limit
  `).all({ userId, ...window, limit: safeTopN }) as TrendTypeRow[];

  const pointsForType = db.prepare(`
    SELECT date(sessions.date) AS date, COUNT(*) AS count
    FROM annotations
    JOIN sessions ON sessions.id = annotations.session_id
    WHERE sessions.user_id = @userId
      AND annotations.error_type = @errorType
      AND date(sessions.date) >= date('now', @startOffset)
    GROUP BY date(sessions.date)
    ORDER BY date ASC
  `);

  return topTypes.map(type => ({
    errorType: type.error_type,
    points: (pointsForType.all({
      userId,
      errorType: type.error_type,
      ...window,
    }) as DailyMistakeCountRow[]).map(row => ({
      date: row.date,
      count: row.count,
    })),
  }));
}

export function getActivationStats(db: Database.Database, userId: string): { suggested: number; used: number } {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(times_suggested), 0) AS suggested,
      COALESCE(SUM(times_used), 0) AS used
    FROM vocab
    WHERE user_id = ?
  `).get(userId) as { suggested: number; used: number };
  return row;
}

function maxDate(...values: Array<string | null | undefined>): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function mapUserSummary(row: UserSummaryRow): AdminUserSummary {
  return {
    id: row.id,
    name: row.name ?? undefined,
    createdAt: row.created_at ?? undefined,
    vocabCount: row.vocab_count,
    sessionCount: row.session_count,
    sentenceLabCount: row.sentence_lab_count,
    lastActivity: maxDate(row.last_session_at, row.last_sentence_lab_at, row.last_vocab_at),
  };
}

export function listAdminUsers(db: Database.Database): AdminUserSummary[] {
  const rows = db.prepare(`
    SELECT
      users.id,
      users.name,
      users.created_at,
      (SELECT COUNT(*) FROM vocab WHERE vocab.user_id = users.id) AS vocab_count,
      (SELECT COUNT(*) FROM sessions WHERE sessions.user_id = users.id) AS session_count,
      (SELECT COUNT(*) FROM sentence_lab_drafts WHERE sentence_lab_drafts.user_id = users.id) AS sentence_lab_count,
      (SELECT MAX(COALESCE(sessions.created_at, sessions.date)) FROM sessions WHERE sessions.user_id = users.id) AS last_session_at,
      (SELECT MAX(sentence_lab_drafts.created_at) FROM sentence_lab_drafts WHERE sentence_lab_drafts.user_id = users.id) AS last_sentence_lab_at,
      (SELECT MAX(vocab.last_captured) FROM vocab WHERE vocab.user_id = users.id) AS last_vocab_at
    FROM users
    ORDER BY COALESCE(last_session_at, last_sentence_lab_at, last_vocab_at, users.created_at) DESC
  `).all() as UserSummaryRow[];
  return rows.map(mapUserSummary);
}

export function getAdminUserSummary(db: Database.Database, userId: string): AdminUserSummary | undefined {
  return listAdminUsers(db).find(user => user.id === userId);
}

function mapHistoryAnnotation(row: HistoryAnnotationRow): WritingHistoryAnnotation {
  return {
    span: row.span_text,
    errorType: row.error_type,
    rule: row.rule ?? undefined,
    userRewrite: row.user_rewrite ?? undefined,
    accepted: Boolean(row.accepted),
  };
}

function sessionContext(row: HistorySessionRow): WritingHistoryEntry['context'] {
  const context = {
    label: row.context_label ?? undefined,
    title: row.context_title ?? undefined,
    url: row.context_url ?? undefined,
    excerpt: row.context_excerpt ?? undefined,
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}

function mapSentenceLabHistoryAnnotation(row: SentenceLabHistoryAnnotationRow): WritingHistoryAnnotation {
  return {
    span: row.span_text,
    errorType: row.error_type,
    rule: row.rule ?? undefined,
    userRewrite: row.user_rewrite ?? undefined,
    accepted: Boolean(row.accepted),
  };
}

function sentenceLabDraftAnnotations(row: SentenceLabDraftRow): WritingHistoryAnnotation[] {
  try {
    const response = JSON.parse(row.response_json) as CoachResponse;
    return response.annotations.map(annotation => ({
      span: annotation.span,
      errorType: annotation.errorType,
      rule: annotation.rule,
    }));
  } catch {
    return [];
  }
}

export function getWritingHistory(db: Database.Database, userId: string, limit = 100, source?: WritingSource): WritingHistoryEntry[] {
  const safeLimit = boundedPositiveInt(limit, 100, 500);
  let sessions: HistorySessionRow[];
  if (source) {
    sessions = db.prepare(`
      SELECT
        id,
        date,
        draft_text,
        final_text,
        native_text,
        elevated_text,
        evidence_text,
        COALESCE(source, 'daily_writing') AS source,
        created_at,
        context_label,
        context_title,
        context_url,
        context_excerpt
      FROM sessions
      WHERE user_id = ?
        AND COALESCE(source, 'daily_writing') = ?
      ORDER BY COALESCE(created_at, date) DESC, id DESC
      LIMIT ?
    `).all(userId, source, safeLimit) as HistorySessionRow[];
  } else {
    sessions = db.prepare(`
      SELECT
        id,
        date,
        draft_text,
        final_text,
        native_text,
        elevated_text,
        evidence_text,
        COALESCE(source, 'daily_writing') AS source,
        created_at,
        context_label,
        context_title,
        context_url,
        context_excerpt
      FROM sessions
      WHERE user_id = ?
        AND COALESCE(source, 'daily_writing') != 'sentence_lab'
      ORDER BY COALESCE(created_at, date) DESC, id DESC
      LIMIT ?
    `).all(userId, safeLimit) as HistorySessionRow[];
  }

  const sessionIds = sessions.map(session => session.id);
  const annotationRows = sessionIds.length
    ? db.prepare(`
      SELECT session_id, span_text, error_type, rule, user_rewrite, accepted
      FROM annotations
      WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})
      ORDER BY id ASC
    `).all(...sessionIds) as HistoryAnnotationRow[]
    : [];
  const annotationsBySession = new Map<number, WritingHistoryAnnotation[]>();
  for (const row of annotationRows) {
    const existing = annotationsBySession.get(row.session_id) ?? [];
    existing.push(mapHistoryAnnotation(row));
    annotationsBySession.set(row.session_id, existing);
  }

  const dailyEntries = sessions.map(session => ({
    id: session.id,
    date: session.date ?? undefined,
    createdAt: session.created_at ?? undefined,
    source: session.source ?? 'daily_writing',
    context: sessionContext(session),
    draftText: session.draft_text,
    finalText: session.final_text ?? undefined,
    nativeText: session.native_text ?? undefined,
    elevatedText: session.elevated_text ?? undefined,
    evidenceText: session.evidence_text ?? undefined,
    annotations: annotationsBySession.get(session.id) ?? [],
  }));

  const sentenceLabDrafts = (source && source !== 'sentence_lab') ? [] : db.prepare(`
    SELECT id, user_id, date, sentence, context, response_json, created_at
    FROM sentence_lab_drafts
    WHERE user_id = ?
    ORDER BY COALESCE(created_at, date) DESC, id DESC
    LIMIT ?
  `).all(userId, safeLimit) as SentenceLabDraftRow[];

  const draftIds = new Set(sentenceLabDrafts.map(draft => draft.id));
  const sentenceLabRows = draftIds.size
    ? db.prepare(`
      SELECT
        annotations.paragraph_idx - @offset AS draft_id,
        annotations.span_text,
        annotations.error_type,
        annotations.rule,
        annotations.user_rewrite,
        annotations.accepted
      FROM annotations
      JOIN sessions ON sessions.id = annotations.session_id
      WHERE sessions.user_id = @userId
        AND COALESCE(sessions.source, 'daily_writing') = 'sentence_lab'
        AND annotations.paragraph_idx >= @offset
      ORDER BY annotations.id ASC
    `).all({ userId, offset: SENTENCE_LAB_PARAGRAPH_OFFSET })
      .filter(row => draftIds.has((row as SentenceLabHistoryAnnotationRow).draft_id)) as SentenceLabHistoryAnnotationRow[]
    : [];

  const annotationsByDraft = new Map<number, WritingHistoryAnnotation[]>();
  for (const row of sentenceLabRows) {
    const existing = annotationsByDraft.get(row.draft_id) ?? [];
    existing.push(mapSentenceLabHistoryAnnotation(row));
    annotationsByDraft.set(row.draft_id, existing);
  }

  const sentenceLabEntries = sentenceLabDrafts.map(draft => {
    const annotations = annotationsByDraft.get(draft.id) ?? sentenceLabDraftAnnotations(draft);
    return {
      id: draft.id,
      date: draft.date ?? undefined,
      createdAt: draft.created_at ?? undefined,
      source: 'sentence_lab' as const,
      draftText: draft.sentence,
      finalText: annotations.find(annotation => annotation.userRewrite)?.userRewrite,
      annotations,
    };
  });

  return [...dailyEntries, ...sentenceLabEntries]
    .sort((a, b) => {
      const aDate = a.createdAt ?? a.date ?? '';
      const bDate = b.createdAt ?? b.date ?? '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return b.id - a.id;
    })
    .slice(0, safeLimit);
}

export function insertSession(db: Database.Database, userId: string, input: InsertSessionInput): number {
  const result = db.prepare(`
    INSERT INTO sessions (
      user_id, date, prompt_id, draft_text, final_text, duration_s, source,
      native_text, elevated_text, evidence_text,
      context_label, context_title, context_url, context_excerpt, created_at
    )
    VALUES (
      @userId, @date, @promptId, @draftText, @finalText, @durationS, @source,
      @nativeText, @elevatedText, @evidenceText,
      @contextLabel, @contextTitle, @contextUrl, @contextExcerpt, datetime('now')
    )
  `).run({
    userId,
    date: input.date ?? new Date().toISOString(),
    promptId: input.promptId ?? null,
    draftText: input.draftText,
    finalText: input.finalText ?? null,
    nativeText: input.nativeText ?? null,
    elevatedText: input.elevatedText ?? null,
    evidenceText: input.evidenceText ?? null,
    durationS: input.durationS ?? null,
    source: input.source ?? 'daily_writing',
    contextLabel: input.contextLabel?.trim() || null,
    contextTitle: input.contextTitle?.trim() || null,
    contextUrl: input.contextUrl?.trim() || null,
    contextExcerpt: input.contextExcerpt?.trim() || null,
  });
  return Number(result.lastInsertRowid);
}

function sessionDay(date?: string): string {
  return date?.trim() || new Date().toISOString().slice(0, 10);
}

const SENTENCE_LAB_PARAGRAPH_OFFSET = 1_000_000;

export function insertSentenceLabDraft(
  db: Database.Database,
  userId: string,
  input: { date?: string; sentence: string; context?: string; response: CoachResponse },
): number {
  const result = db.prepare(`
    INSERT INTO sentence_lab_drafts (user_id, date, sentence, context, response_json)
    VALUES (@userId, @date, @sentence, @context, @responseJson)
  `).run({
    userId,
    date: sessionDay(input.date),
    sentence: input.sentence,
    context: input.context?.trim() || null,
    responseJson: JSON.stringify(input.response),
  });
  return Number(result.lastInsertRowid);
}

export function getSentenceLabDraft(db: Database.Database, userId: string, id: number): SentenceLabDraft | undefined {
  const row = db.prepare(`
    SELECT id, user_id, date, sentence, context, response_json
    FROM sentence_lab_drafts
    WHERE user_id = ? AND id = ?
  `).get(userId, id) as SentenceLabDraftRow | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    date: row.date ?? sessionDay(),
    sentence: row.sentence,
    context: row.context ?? undefined,
    response: JSON.parse(row.response_json) as CoachResponse,
  };
}

export function recordSentenceLabResult(
  db: Database.Database,
  userId: string,
  input: { id: number; rewrite: string },
): ParagraphResultRecord {
  const draft = getSentenceLabDraft(db, userId, input.id);
  if (!draft) throw new Error('Sentence Lab diagnosis not found.');

  return recordParagraphResult(db, userId, {
    date: draft.date,
    paragraphIdx: SENTENCE_LAB_PARAGRAPH_OFFSET + draft.id,
    paragraph: draft.sentence,
    rewrite: input.rewrite,
    annotations: draft.response.annotations,
    source: 'sentence_lab',
  });
}

function findSessionForDay(db: Database.Database, userId: string, date: string, promptId: number | undefined, source: WritingSource): number | undefined {
  const row = db.prepare(`
    SELECT id
    FROM sessions
    WHERE user_id = @userId
      AND date = @date
      AND COALESCE(source, 'daily_writing') = @source
      AND (
        (@promptId IS NULL AND prompt_id IS NULL)
        OR prompt_id = @promptId
      )
    ORDER BY id ASC
    LIMIT 1
  `).get({ userId, date, promptId: promptId ?? null, source }) as { id: number } | undefined;
  return row?.id;
}

function getOrCreateParagraphSession(db: Database.Database, userId: string, input: ParagraphResultInput): ParagraphResultRecord {
  const date = sessionDay(input.date);
  const source = input.source ?? 'daily_writing';
  const existing = findSessionForDay(db, userId, date, input.promptId, source);
  if (existing) {
    db.prepare(`
      UPDATE sessions
      SET draft_text = CASE
          WHEN draft_text IS NULL OR draft_text = '' THEN @paragraph
          ELSE draft_text
        END,
        final_text = @rewrite,
        native_text = COALESCE(@nativeText, native_text),
        elevated_text = COALESCE(@elevatedText, elevated_text),
        evidence_text = COALESCE(@evidenceText, evidence_text)
      WHERE user_id = @userId AND id = @id
    `).run({
      userId,
      id: existing,
      paragraph: input.paragraph,
      rewrite: input.rewrite,
      nativeText: input.nativeText ?? null,
      elevatedText: input.elevatedText ?? null,
      evidenceText: input.evidenceText ?? null,
    });
    return { sessionId: existing, created: false };
  }

  const sessionId = insertSession(db, userId, {
    date,
    promptId: input.promptId,
    draftText: input.paragraph,
    finalText: input.rewrite,
    nativeText: input.nativeText,
    elevatedText: input.elevatedText,
    evidenceText: input.evidenceText,
    source,
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
  userId: string,
  sessionId: number,
  annotations: InsertAnnotationInput[],
) {
  const session = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND id = ?')
    .get(userId, sessionId) as { id: number } | undefined;
  if (!session) throw new Error('Session not found for user.');

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
  userId: string,
  input: ParagraphResultInput,
): ParagraphResultRecord {
  const applyResult = db.transaction(() => {
    const session = getOrCreateParagraphSession(db, userId, input);
    const previous = db.prepare(`
      SELECT error_type, model_rewrite, accepted
      FROM annotations
      JOIN sessions ON sessions.id = annotations.session_id
      WHERE sessions.user_id = ? AND session_id = ? AND paragraph_idx = ?
    `).all(userId, session.sessionId, input.paragraphIdx) as StoredAnnotationRow[];

    db.prepare(`
      DELETE FROM annotations
      WHERE session_id = (
        SELECT id FROM sessions WHERE user_id = ? AND id = ?
      )
      AND paragraph_idx = ?
    `).run(userId, session.sessionId, input.paragraphIdx);

    const nextAnnotations: InsertAnnotationInput[] = input.annotations.map(annotation => ({
      ...annotation,
      paragraphIdx: input.paragraphIdx,
      userRewrite: input.rewrite,
    }));
    insertAnnotations(db, userId, session.sessionId, nextAnnotations);

    decrementErrors(db, userId, tallyErrorTypes(previous));
    recordErrors(db, userId, submittedErrorTypes(nextAnnotations));

    for (const word of acceptedVocabWords(previous)) {
      decrementVocabUsed(db, userId, word);
    }
    for (const word of submittedVocabWords(nextAnnotations)) {
      incrementVocabUsed(db, userId, word);
    }

    return session;
  });

  return applyResult();
}

interface PatternRow {
  id: number;
  phrase: string;
  preposition: string;
  cue: string;
  example: string | null;
  note: string | null;
  times_seen: number;
  times_correct: number;
  last_reviewed: string | null;
  created_at: string | null;
}

function patternFromRow(row: PatternRow): Pattern {
  return {
    id: row.id,
    phrase: row.phrase,
    preposition: row.preposition,
    cue: row.cue,
    example: row.example ?? undefined,
    note: row.note ?? undefined,
    timesSeen: row.times_seen,
    timesCorrect: row.times_correct,
    lastReviewed: row.last_reviewed ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

export interface InsertPatternInput {
  phrase: string;
  preposition: string;
  cue: string;
  example?: string;
  note?: string;
}

export function insertPattern(db: Database.Database, userId: string, input: InsertPatternInput): Pattern {
  const info = db.prepare(`
    INSERT INTO patterns (user_id, phrase, preposition, cue, example, note)
    VALUES (@userId, @phrase, @preposition, @cue, @example, @note)
    ON CONFLICT(user_id, phrase) DO UPDATE SET
      preposition = excluded.preposition,
      cue = excluded.cue,
      example = COALESCE(excluded.example, patterns.example),
      note = COALESCE(excluded.note, patterns.note)
  `).run({
    userId,
    phrase: input.phrase,
    preposition: input.preposition,
    cue: input.cue,
    example: input.example ?? null,
    note: input.note ?? null,
  });
  const id = info.lastInsertRowid
    ? Number(info.lastInsertRowid)
    : (db.prepare('SELECT id FROM patterns WHERE user_id = ? AND phrase = ?').get(userId, input.phrase) as { id: number }).id;
  return getPattern(db, userId, id)!;
}

export function getPattern(db: Database.Database, userId: string, id: number): Pattern | undefined {
  const row = db.prepare('SELECT * FROM patterns WHERE id = ? AND user_id = ?').get(id, userId) as PatternRow | undefined;
  return row ? patternFromRow(row) : undefined;
}

export function listPatterns(db: Database.Database, userId: string): Pattern[] {
  const rows = db.prepare(`
    SELECT * FROM patterns
    WHERE user_id = ?
    ORDER BY preposition COLLATE NOCASE ASC, phrase COLLATE NOCASE ASC
  `).all(userId) as PatternRow[];
  return rows.map(patternFromRow);
}

export function recordPatternReview(db: Database.Database, userId: string, id: number, correct: boolean): Pattern | undefined {
  const existing = db.prepare('SELECT id FROM patterns WHERE id = ? AND user_id = ?').get(id, userId) as { id: number } | undefined;
  if (!existing) return undefined;
  db.prepare(`
    UPDATE patterns
    SET times_seen = times_seen + 1,
        times_correct = times_correct + ?,
        last_reviewed = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(correct ? 1 : 0, id, userId);
  return getPattern(db, userId, id);
}

export function deletePattern(db: Database.Database, userId: string, id: number): boolean {
  const info = db.prepare('DELETE FROM patterns WHERE id = ? AND user_id = ?').run(id, userId);
  return info.changes > 0;
}
