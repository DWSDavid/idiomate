import type { NewsItem, ResearchSource, IntegrationNote } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import {
  assembleResearchIntegrationPrompt,
  assembleResearchPrompt,
  assembleSourceSummaryPrompt,
} from './prompts.js';
import {
  researchAnalysisZ,
  researchIntegrationZ,
  researchSourceSummariesZ,
} from './schema.js';

export interface ResearchAnalysis {
  analysis: string;
  otherAngles: string[];
  searchQueries: string[];
}

export async function analyzeResearchEssay(
  provider: LLMProvider,
  ctx: { essay: string; model: string },
): Promise<ResearchAnalysis> {
  const { system, user } = assembleResearchPrompt({ essay: ctx.essay });
  const raw = await provider.complete({ system, user, model: ctx.model });
  return researchAnalysisZ.parse(JSON.parse(raw));
}

export async function summarizeResearchSources(
  provider: LLMProvider,
  ctx: { essay: string; sources: NewsItem[]; model: string },
): Promise<ResearchSource[]> {
  if (!ctx.sources.length) return [];
  const { system, user } = assembleSourceSummaryPrompt({
    essay: ctx.essay,
    sources: ctx.sources,
  });
  const raw = await provider.complete({ system, user, model: ctx.model });
  return researchSourceSummariesZ.parse(JSON.parse(raw)).sources;
}

export async function integrateResearchEvidence(
  provider: LLMProvider,
  ctx: { essay: string; sources: ResearchSource[]; model: string },
): Promise<{ integratedEssay: string; integrationNotes: IntegrationNote[] }> {
  const { system, user } = assembleResearchIntegrationPrompt({
    essay: ctx.essay,
    sources: ctx.sources,
  });
  const raw = await provider.complete({ system, user, model: ctx.model });
  return researchIntegrationZ.parse(JSON.parse(raw));
}
