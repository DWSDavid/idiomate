import type { PatternUsageCheckResponse } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { patternUsageCheckZ } from './schema.js';

export interface PatternUsageContext {
  phrase: string;
  preposition: string;
  sentence: string;
}

export function assemblePatternUsagePrompt(ctx: PatternUsageContext): { system: string; user: string } {
  return {
    system: [
      'You check whether a learner used a fixed prepositional pattern correctly and naturally in their own sentence.',
      'The pattern is a fixed collocation whose preposition has no derivable logic and must be memorized.',
      'Judge two things: (1) did they include the pattern with the CORRECT preposition, and (2) does the sentence read naturally.',
      'feedback: say what worked and, if wrong, name the correct preposition and why the sentence needs it. Chinese may be used when it clarifies.',
      'modelSentence: one natural example sentence that uses the pattern correctly.',
      'Return ONLY JSON matching: {correct,feedback,modelSentence}.',
    ].join(' '),
    user: [
      `Pattern: ${ctx.phrase}`,
      `Required preposition: ${ctx.preposition}`,
      `Learner's sentence: ${ctx.sentence}`,
    ].join('\n'),
  };
}

export async function checkPatternUsage(
  provider: LLMProvider,
  ctx: PatternUsageContext & { model: string },
): Promise<PatternUsageCheckResponse> {
  const { system, user } = assemblePatternUsagePrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return patternUsageCheckZ.parse(JSON.parse(raw));
}
