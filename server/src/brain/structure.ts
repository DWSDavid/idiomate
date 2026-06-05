import type { StructureResponse } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { assembleStructurePrompt } from './prompts.js';
import { structureResponseZ } from './schema.js';

export async function generateStructureGuidance(
  provider: LLMProvider,
  ctx: { draft: string; model: string },
): Promise<StructureResponse> {
  const { system, user } = assembleStructurePrompt({ draft: ctx.draft });
  const raw = await provider.complete({ system, user, model: ctx.model });
  return structureResponseZ.parse(JSON.parse(raw));
}
