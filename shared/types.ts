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

export interface SentenceTranslationResponse {
  sentence: string;
  translation: string;
}

// Flow Coach: line-by-line connective / tense / sentence-splitting coaching over a
// whole draft, plus a write-your-own practice drill seeded from the user's saved vocab.
export interface FlowConnective {
  connective: string; // e.g. "Even though", "As a result", "merge", "relative clause (which)"
  why: string;
}

export interface FlowTenseNote {
  tense: string;
  why: string;
}

export interface FlowDrill {
  prompt: string;        // a NEW mini task in a similar context
  targetSkill: string;   // e.g. "concession connective + present tense"
  vocabUsed: string[];   // saved words the drill asks the writer to deploy
  modelAnswer: string;   // hidden client-side until a check returns
}

export interface FlowLine {
  original: string;
  pieces: string[];                        // logical sub-ideas the sentence contains
  rewrite: string;
  linkToPrevious: FlowConnective | null;   // null for the first sentence
  tenseNote: FlowTenseNote | null;         // only when tense is a teaching point
  changes: string[];                       // short what-changed-and-why notes
  drill: FlowDrill;
}

export interface FlowAnalysisResponse {
  lines: FlowLine[];
}

export interface FlowDrillCheckResponse {
  correct: boolean;
  feedback: string;      // names the connective + tense
  modelAnswer: string;
}

// Pattern bank: fixed prepositional collocations ("on the stage", "at an event",
// "play with") that have no derivable logic and must be memorized + drilled.
export interface Pattern {
  id: number;
  phrase: string;         // "on the stage"
  preposition: string;    // "on"  (the gap answer)
  cue: string;            // "___ the stage"
  example?: string;
  note?: string;
  timesSeen: number;
  timesCorrect: number;
  lastReviewed?: string;
  createdAt?: string;
}

export interface PatternUsageCheckResponse {
  correct: boolean;
  feedback: string;
  modelSentence: string;
}

// Common English prepositions/particles used to auto-detect the gap when adding a
// pattern. Ordered longest-first so multi-word ones win (e.g. "out of" before "of").
export const PREPOSITIONS: readonly string[] = [
  'according to', 'out of', 'because of', 'instead of', 'ahead of', 'in front of',
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond',
  'by', 'down', 'during', 'for', 'from', 'in', 'inside', 'into', 'near', 'of',
  'off', 'on', 'onto', 'over', 'through', 'to', 'toward', 'towards', 'under',
  'until', 'up', 'upon', 'with', 'within', 'without',
];

function wordBoundaryRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

// Best-effort: pick the preposition to blank out. Longest match first so multi-word
// prepositions win. Returns '' if none found (the user then picks it manually).
export function detectPreposition(phrase: string): string {
  const lower = ` ${phrase.toLowerCase()} `;
  for (const prep of PREPOSITIONS) {
    if (wordBoundaryRegex(prep).test(lower)) return prep;
  }
  return '';
}

// Replace the first whole-word occurrence of the preposition with a blank.
export function buildPatternCue(phrase: string, preposition: string): string {
  if (!preposition) return phrase;
  return phrase.replace(wordBoundaryRegex(preposition), '___');
}

// Rule-only extraction: turn a phrase that already contains a preposition into a pattern,
// or return null. Used to backfill the bank for free (no AI) from existing vocab.
export function rulePatternFrom(phrase: string): { phrase: string; preposition: string; cue: string } | null {
  const trimmed = phrase.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 6) return null;
  const preposition = detectPreposition(trimmed);
  if (!preposition) return null;
  const cue = buildPatternCue(trimmed, preposition);
  if (cue === trimmed) return null; // preposition not actually blanked
  return { phrase: trimmed, preposition, cue };
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
