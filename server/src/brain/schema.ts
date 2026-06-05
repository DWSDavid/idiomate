import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';

const ruleExampleZ = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
});

export const annotationZ = z.object({
  span: z.string().min(1),
  // Tolerant: if the model invents an out-of-enum errorType, fall back rather than 500 the whole response.
  errorType: z.enum(ERROR_TYPES).catch('small_grammar'),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  rule: z.string().min(1).optional(),
  ruleExample: ruleExampleZ.optional(),
  modelRewrite: z.string(),
  vocabWord: z.string().optional(),
});

export const coachResponseZ = z.object({
  paragraphIndex: z.number(),
  annotations: z.array(annotationZ),
  nativeVersion: z.string().optional(),
});

export const dailyPromptZ = z.object({
  theme: z.string().min(1),
  text: z.string().min(1),
});

export const primeWordsZ = z.object({
  words: z.array(z.string().min(1)).min(1).max(10),
});

const vocabKindZ = z.enum(['word', 'phrase', 'collocation']);

export const enrichedVocabZ = z.object({
  word: z.string().min(1),
  normalized: z.string().optional(),
  kind: vocabKindZ.optional(),
  ipa: z.string().optional(),
  defCn: z.string().optional(),
  pos: z.string().optional(),
  contextSentence: z.string().optional(),
  examples: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  register: z.string().optional(),
});

export const lessonComparisonPairZ = z.object({
  before: z.string().min(1),
  after: z.string().min(1),
  note: z.string().optional(),
});

export const lessonGeneratedZ = z.object({
  principle: z.string().min(1),
  mindset: z.string().min(1),
  extraPairs: z.array(lessonComparisonPairZ).min(1).max(6),
});

export const lessonComparisonPairsZ = z.array(lessonComparisonPairZ).min(4).max(6);

export const researchAnalysisZ = z.object({
  analysis: z.string().min(1),
  otherAngles: z.array(z.string().min(1)).default([]),
  searchQueries: z.array(z.string().min(1)).default([]),
});

export const researchSourceSummaryZ = z.object({
  title: z.string().min(1),
  link: z.string().min(1),
  summary: z.string().min(1),
});

export const researchSourceSummariesZ = z.object({
  sources: z.array(researchSourceSummaryZ).default([]),
});

export const integrationStructurePartZ = z.enum(['topic sentence', 'claim', 'evidence', 'commentary']);

export const integrationNoteZ = z.object({
  insertedAfter: z.string().min(1),
  what: z.string().min(1),
  why: z.string().min(1),
  structurePart: integrationStructurePartZ,
});

export const researchIntegrationZ = z.object({
  integratedEssay: z.string().min(1),
  integrationNotes: z.array(integrationNoteZ).default([]),
});
