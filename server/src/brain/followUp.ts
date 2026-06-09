import type { FollowUpResponse } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleFollowUpPrompt, type FollowUpPromptContext } from './prompts.js';
import { followUpResponseZ } from './schema.js';

export async function answerFollowUp(
  provider: LLMProvider,
  ctx: FollowUpPromptContext & { model: string },
): Promise<FollowUpResponse> {
  const { system, user } = assembleFollowUpPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  const parsed = followUpResponseZ.parse(JSON.parse(raw));
  return {
    answer: parsed.answer,
    mode: ctx.mode,
  };
}
