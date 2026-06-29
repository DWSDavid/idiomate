import type { ErrorType } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleSpeakingReviewPrompt, type PromptMemoryContext } from './prompts.js';
import { speakingReviewResponseZ } from './schema.js';

export interface SpeakingReviewContext {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  topErrors: ErrorType[];
  memoryContext?: PromptMemoryContext;
  model: string;
}

export async function reviewSpeakingTranscript(p: LLMProvider, ctx: SpeakingReviewContext) {
  const { system, user } = assembleSpeakingReviewPrompt(ctx);
  const raw = await p.complete({ system, user, model: ctx.model });
  return speakingReviewResponseZ.parse(JSON.parse(raw));
}
