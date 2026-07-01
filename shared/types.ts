export const ERROR_TYPES = [
  'redundancy', 'noun_plague', 'calque', 'over_explanation', 'tense', 'modality',
  'word_order', 'sprawl', 'small_grammar', 'word_choice', 'cohesion',
  'vocab_suggestion',
] as const;
export type ErrorType = typeof ERROR_TYPES[number];
export type VocabKind = 'word' | 'phrase' | 'collocation';
export type YoudaoDirection = string;

export interface BookReference {
  source: string;
  pattern: string;
  quote?: string;
  quoteStatus?: string;
  exampleBefore?: string;
  exampleAfter?: string;
}

export interface Annotation {
  span: string;            // exact substring of the paragraph
  errorType: ErrorType;
  hint: string;            // shown BEFORE the user rewrites (no answer leaked)
  explanation: string;     // shown AFTER, names the error + why
  rule?: string;            // named grammar or Chinglish principle
  ruleExample?: { before: string; after: string };
  bookReference?: BookReference;
  modelRewrite: string;    // hidden until user submits their rewrite
  vocabWord?: string;      // set when errorType === 'vocab_suggestion'
  distinction?: string;    // nuanced comparison for vocab_suggestion
}

export interface CoachResponse {
  paragraphIndex: number;
  annotations: Annotation[];
  nativeVersion?: string;
  elevatedVersion?: string;
  elevationNotes?: string;
}

export interface Vocab {
  id?: number;
  word: string;
  normalized?: string;
  baseForm?: string;
  kind?: VocabKind;
  ipa?: string;
  defCn?: string;
  pos?: string;
  status?: string;
  source?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  direction?: YoudaoDirection;
  contextSentence?: string;
  examples?: string[];
  collocations?: string[];
  register?: string;
  captureCount?: number;
  lastCaptured?: string;
  ease?: 'new' | 'hard' | 'easy';
  lastReviewed?: string;
  wordFamily?: string[];
  nearSynonyms?: Array<{ word: string; distinction: string }>;
  timesSuggested: number;
  timesUsed: number;
  sm2Interval?: number;
  sm2Ease?: number;
  sm2Reps?: number;
  nextReviewAt?: string;
  graduated?: boolean;
  graduatedAt?: string;
}

export interface VocabListItem {
  id: number;
  word: string;
  kind: VocabKind;
  defCn?: string;
  pos?: string;
  nearSynonyms?: Array<{ word: string; distinction: string }>;
  captureCount: number;
  timesSuggested: number;
  timesUsed: number;
  lastCaptured?: string;
  capturedDate?: string;
  graduated?: boolean;
  nextReviewAt?: string;
  dateAdded?: string;
  source?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  contextSentence?: string;
  examples?: string[];
}

export interface VocabListResponse {
  total: number;
  items: VocabListItem[];
}

export interface SaveVocabResponse {
  id: number;
  captureCount: number;
  previousCaptureCount?: number;
  captureDelta?: number;
  existed: boolean;
  canonicalWord?: string;
  normalized?: string;
  baseForm?: string;
}

export interface ChineseVocabResponse extends SaveVocabResponse {
  vocab: Vocab;
}

export interface Prompt {
  id?: number;
  date: string;
  theme: string;
  text: string;
  // An essay-length, argumentative version of the same day's prompt. `text` stays the short
  // (3-5 sentence) opinion prompt; `essayPrompt` invites a full stance-and-support essay.
  essayPrompt?: string;
  sourceUrl?: string;
  newsItems?: NewsItem[];
  // Verbatim, attributable pull-quotes extracted from the source articles so the writer can
  // cite them directly or paraphrase in their own words.
  sourceQuotes?: SourceQuote[];
  saved?: boolean;
  createdAt?: string;
  lastUsedAt?: string;
  source?: string;
}

export interface SourceQuote {
  quote: string;
  source?: string;
  link?: string;
}

export interface PromptLibraryResponse {
  prompts: Prompt[];
}
export interface ErrorTally { errorType: ErrorType; count: number; lastSeen: string; }

export interface MistakeExample {
  span: string;
  userRewrite?: string;
  rule?: string;
  date?: string;
}

export interface MistakeRankingItem {
  errorType: ErrorType;
  count: number;
  lastSeen: string;
  recentExamples: MistakeExample[];
}

export interface MistakeLogItem extends MistakeExample {
  errorType: ErrorType;
}

export interface LessonRule {
  name: string;
  principle: string;
  mindset?: string;
  bookReference?: BookReference;
}

export interface LessonComparisonPair {
  before: string;
  after: string;
  note?: string;
}

export interface LessonResponse {
  errorType: ErrorType;
  rules: LessonRule[];
  principle: string;
  mindset: string;
  pastInstances: MistakeLogItem[];
  comparisonPairs: LessonComparisonPair[];
}

export interface NewsItem {
  title: string;
  link: string;
  source?: string;
}

export interface ResearchSource {
  title: string;
  link: string;
  summary: string;
}

export type IntegrationStructurePart = 'topic sentence' | 'claim' | 'evidence' | 'commentary';

export interface IntegrationNote {
  insertedAfter: string;
  what: string;
  why: string;
  structurePart: IntegrationStructurePart;
}

export interface ResearchResponse {
  analysis: string;
  otherAngles: string[];
  sources: ResearchSource[];
  integratedEssay: string;
  integrationNotes: IntegrationNote[];
}

export interface StructureOutlinePart {
  part: string;
  purpose: string;
}

export type StructureStatus = 'present' | 'weak' | 'missing';

export interface StructureObservation {
  part: string;
  status: StructureStatus;
  note: string;
}

export interface StructureResponse {
  idealOutline: StructureOutlinePart[];
  observations: StructureObservation[];
}

export interface ProgressDailyPoint {
  date: string;
  count: number;
}

export interface MistakeTrendSeries {
  errorType: ErrorType;
  points: ProgressDailyPoint[];
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: string;
}

export interface ProgressResponse {
  daily: ProgressDailyPoint[];
  trend: MistakeTrendSeries[];
  streak: StreakInfo;
  activityDays: string[];
}

export type WritingSource = 'daily_writing' | 'free_writing' | 'coach_review' | 'sentence_lab' | 'speaking_review';

export interface WritingHistoryAnnotation {
  span: string;
  errorType: ErrorType;
  rule?: string;
  userRewrite?: string;
  accepted?: boolean;
}

export interface WritingHistoryContext {
  label?: string;
  title?: string;
  url?: string;
  excerpt?: string;
}

export interface WritingHistoryEntry {
  id: number;
  date?: string;
  createdAt?: string;
  source: WritingSource;
  draftText: string;
  finalText?: string;
  nativeText?: string;
  elevatedText?: string;
  evidenceText?: string;
  annotations: WritingHistoryAnnotation[];
  context?: WritingHistoryContext;
}

export interface WritingHistoryResponse {
  entries: WritingHistoryEntry[];
}

export interface SpeakingReviewContext {
  label?: string;
  title?: string;
  url?: string;
  excerpt?: string;
}

export interface SpeakingReviewResponse {
  id: number;
  transcript: string;
  nativeVersion: string;
  annotations: Array<Annotation & { userRewrite?: string; accepted?: boolean }>;
  takeaways: string[];
  context?: SpeakingReviewContext;
}

export interface AdminUserSummary {
  id: string;
  name?: string;
  createdAt?: string;
  vocabCount: number;
  sessionCount: number;
  sentenceLabCount: number;
  lastActivity?: string;
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
}

export interface AdminUserDetailResponse {
  user: AdminUserSummary;
  vocab: VocabListResponse;
  history: WritingHistoryResponse;
}

export type SentenceLabNote = Pick<Annotation, 'span' | 'errorType' | 'hint' | 'explanation' | 'rule' | 'bookReference'>;

export interface SentenceLabDiagnosisResponse {
  id: number;
  sentence: string;
  context?: string;
  notes: SentenceLabNote[];
}

export interface SentenceLabResultResponse {
  id: number;
  sentence: string;
  context?: string;
  rewrite: string;
  nativeVersion?: string;
  annotations: Array<Annotation & { userRewrite?: string; accepted?: boolean }>;
}

export type FollowUpScope = 'sentence_lab' | 'paragraph';
export type FollowUpMode = 'pre_rewrite' | 'post_rewrite';

export interface FollowUpResponse {
  answer: string;
  mode: FollowUpMode;
}

export interface SessionSaveResult {
  id: number;
  vocabUsed: number;
  vocabTotal: number;
}
