export const ERROR_TYPES = [
  'redundancy', 'noun_plague', 'calque', 'over_explanation', 'tense', 'modality',
  'word_order', 'sprawl', 'small_grammar', 'word_choice', 'cohesion',
  'vocab_suggestion',
] as const;
export type ErrorType = typeof ERROR_TYPES[number];
export type VocabKind = 'word' | 'phrase' | 'collocation';
export type YoudaoDirection = string;

export interface Annotation {
  span: string;            // exact substring of the paragraph
  errorType: ErrorType;
  hint: string;            // shown BEFORE the user rewrites (no answer leaked)
  explanation: string;     // shown AFTER, names the error + why
  rule?: string;            // named grammar or Chinglish principle
  ruleExample?: { before: string; after: string };
  modelRewrite: string;    // hidden until user submits their rewrite
  vocabWord?: string;      // set when errorType === 'vocab_suggestion'
}

export interface CoachResponse {
  paragraphIndex: number;
  annotations: Annotation[];
  nativeVersion?: string;
}

export interface Vocab {
  id?: number;
  word: string;
  normalized?: string;
  kind?: VocabKind;
  ipa?: string;
  defCn?: string;
  pos?: string;
  status?: string;
  source?: string;
  direction?: YoudaoDirection;
  contextSentence?: string;
  examples?: string[];
  collocations?: string[];
  register?: string;
  captureCount?: number;
  lastCaptured?: string;
  timesSuggested: number;
  timesUsed: number;
}

export interface Prompt { id?: number; date: string; theme: string; text: string; sourceUrl?: string; }
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
