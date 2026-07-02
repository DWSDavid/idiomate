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
  distinction: z.string().optional(),
});

export const coachResponseZ = z.object({
  paragraphIndex: z.number(),
  annotations: z.array(annotationZ),
  nativeVersion: z.string().optional(),
});

export const speakingReviewResponseZ = z.object({
  nativeVersion: z.string().min(1),
  annotations: z.array(annotationZ).default([]),
  takeaways: z.array(z.string().min(1)).max(4).default([]),
});

export const dailyPromptZ = z.object({
  theme: z.string().min(1),
  text: z.string().min(1),
  // Optional so the older single-length generator and any model that omits it still parse;
  // the news generator is instructed to always return it.
  essayPrompt: z.string().min(1).optional(),
});

export const sourceQuotesZ = z.object({
  quotes: z.array(z.object({
    quote: z.string().min(1),
    source: z.string().optional(),
    link: z.string().optional(),
  })).default([]),
});

const flowConnectiveZ = z.object({
  connective: z.string().min(1),
  why: z.string().min(1),
}).nullable().catch(null);

const flowTenseNoteZ = z.object({
  tense: z.string().min(1),
  why: z.string().min(1),
}).nullable().catch(null);

const flowDrillZ = z.object({
  prompt: z.string().min(1),
  targetSkill: z.string().min(1).catch('sentence flow'),
  vocabUsed: z.array(z.string().min(1)).default([]),
  modelAnswer: z.string().min(1),
});

export const flowAnalysisZ = z.object({
  lines: z.array(z.object({
    original: z.string().min(1),
    pieces: z.array(z.string().min(1)).default([]),
    rewrite: z.string().min(1),
    linkToPrevious: flowConnectiveZ,
    tenseNote: flowTenseNoteZ,
    changes: z.array(z.string().min(1)).default([]),
    drill: flowDrillZ,
  })).min(1),
});

export const flowDrillCheckZ = z.object({
  correct: z.boolean().catch(false),
  feedback: z.string().min(1),
  modelAnswer: z.string().min(1),
});

export const primeWordsZ = z.object({
  words: z.array(z.string().min(1)).min(1).max(10),
});

const vocabKindZ = z.enum(['word', 'phrase', 'collocation']);

// The model sometimes reads an optional `field?` in the prompt as a yes/no flag and
// returns a boolean (e.g. gpt-4o emits `normalized: false` on the Chinese path). Drop
// non-string values instead of 400ing the whole capture; callers re-derive sane defaults.
const tolerantOptionalString = z.string().optional().catch(undefined);

export const enrichedVocabZ = z.object({
  word: z.string().min(1),
  normalized: tolerantOptionalString,
  baseForm: tolerantOptionalString,
  kind: vocabKindZ.optional(),
  ipa: tolerantOptionalString,
  defCn: tolerantOptionalString,
  pos: tolerantOptionalString,
  contextSentence: tolerantOptionalString,
  examples: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  register: tolerantOptionalString,
});

export const nearSynonymZ = z.object({
  word: z.string().min(1),
  distinction: z.string().min(1),
});

export const usageExampleRichZ = z.object({
  sentence: z.string().min(1),
  role: tolerantOptionalString,
});
export type UsageExampleRich = z.infer<typeof usageExampleRichZ>;

export const wordDeepDiveZ = z.object({
  wordFamily: z.array(z.string().min(1)).min(1).max(12),
  nearSynonyms: z.array(nearSynonymZ).max(4).optional().catch(undefined),
  usageExamples: z.array(z.string().min(1)).min(1).max(3),
  usageExamplesRich: z.array(usageExampleRichZ).min(1).max(3).optional().catch(undefined),
});
export type WordDeepDive = z.infer<typeof wordDeepDiveZ>;

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

export const structureOutlinePartZ = z.object({
  part: z.string().min(1),
  purpose: z.string().min(1),
});

export const structureStatusZ = z.enum(['present', 'weak', 'missing']);

export const structureObservationZ = z.object({
  part: z.string().min(1),
  status: structureStatusZ,
  note: z.string().min(1),
});

export const structureResponseZ = z.object({
  idealOutline: z.array(structureOutlinePartZ).default([]),
  observations: z.array(structureObservationZ).default([]),
});

export const followUpResponseZ = z.object({
  answer: z.string().min(1),
});
