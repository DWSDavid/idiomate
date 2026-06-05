import type { ErrorType, LessonComparisonPair, LessonResponse, LessonRule, MistakeLogItem } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleLessonPrompt } from './prompts.js';
import { lessonComparisonPairsZ, lessonGeneratedZ } from './schema.js';

export interface LessonGenerationContext {
  errorType: ErrorType;
  rules: Array<LessonRule & { example?: LessonComparisonPair }>;
  pastInstances: MistakeLogItem[];
  seedPairs: LessonComparisonPair[];
  model: string;
}

export async function generateLesson(
  provider: LLMProvider,
  ctx: LessonGenerationContext,
): Promise<Pick<LessonResponse, 'principle' | 'mindset' | 'comparisonPairs'>> {
  const prompt = assembleLessonPrompt({
    errorType: ctx.errorType,
    rules: ctx.rules,
    pastInstances: ctx.pastInstances,
    seedPairs: ctx.seedPairs,
  });
  const raw = await provider.complete({
    ...prompt,
    model: ctx.model,
  });
  const generated = lessonGeneratedZ.parse(JSON.parse(raw));
  const comparisonPairs = lessonComparisonPairsZ.parse([
    ...ctx.seedPairs,
    ...generated.extraPairs,
  ].slice(0, 6));

  return {
    principle: generated.principle,
    mindset: generated.mindset,
    comparisonPairs,
  };
}
