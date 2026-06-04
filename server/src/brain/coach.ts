import type { ErrorType } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleCoachPrompt } from './prompts.js';
import { coachResponseZ } from './schema.js';
import type { CoachResponse } from '../../../shared/types.js';

export interface CoachContext {
  paragraph: string;
  paragraphIndex: number;
  topErrors: ErrorType[];
  vocabCandidates: { word: string; defCn?: string }[];
  model: string;
}

export async function coachParagraph(p: LLMProvider, ctx: CoachContext): Promise<CoachResponse> {
  const { system, user } = assembleCoachPrompt(ctx);
  const raw = await p.complete({ system, user, model: ctx.model });
  const json = JSON.parse(raw);
  return coachResponseZ.parse(json);
}
