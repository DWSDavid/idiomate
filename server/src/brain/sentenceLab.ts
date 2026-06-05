import type { CoachResponse, ErrorType } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleSentenceLabPrompt } from './prompts.js';
import { coachResponseZ } from './schema.js';

export interface SentenceLabContext {
  sentence: string;
  context?: string;
  topErrors: ErrorType[];
  model: string;
}

export async function diagnoseSentence(p: LLMProvider, ctx: SentenceLabContext): Promise<CoachResponse> {
  const { system, user } = assembleSentenceLabPrompt(ctx);
  const raw = await p.complete({ system, user, model: ctx.model });
  return coachResponseZ.parse(JSON.parse(raw));
}
