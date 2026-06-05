import { Router } from 'express';
import { z } from 'zod';
import type { NewsItem, ResearchResponse, ResearchSource } from '../../../shared/types.js';
import type { AppDependencies, NewsFetcher } from '../appContext.js';
import {
  analyzeResearchEssay,
  integrateResearchEvidence,
  type ResearchAnalysis,
  summarizeResearchSources,
} from '../brain/research.js';
import { config } from '../config.js';
import { fetchNews } from '../news.js';

const researchBodyZ = z.object({
  essay: z.string().min(1),
});

const MAX_QUERIES = 4;
const SOURCES_PER_QUERY = 2;

const FALLBACK_ANALYSIS: ResearchAnalysis = {
  analysis: 'The draft has a claim, but the research model was unavailable. Check whether each claim has a clear evidence slot and commentary.',
  otherAngles: [],
  searchQueries: [],
};

export function createResearchRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const { essay } = researchBodyZ.parse(req.body);
      const model = config.modelUtility;
      const analysis = await safeAnalyze(deps, essay, model);
      const rawSources = await collectSources(deps.newsFetcher ?? fetchNews, analysis.searchQueries);
      const sources = await safeSummarize(deps, essay, rawSources, model);
      const integration = await safeIntegrate(deps, essay, sources, model);

      const response: ResearchResponse = {
        analysis: analysis.analysis,
        otherAngles: analysis.otherAngles,
        sources,
        integratedEssay: integration.integratedEssay,
        integrationNotes: integration.integrationNotes,
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

async function safeAnalyze(
  deps: AppDependencies,
  essay: string,
  model: string,
): Promise<ResearchAnalysis> {
  try {
    return await analyzeResearchEssay(deps.utilityProvider, { essay, model });
  } catch {
    return FALLBACK_ANALYSIS;
  }
}

async function collectSources(fetcher: NewsFetcher, searchQueries: string[]): Promise<NewsItem[]> {
  const sources: NewsItem[] = [];
  for (const query of searchQueries.slice(0, MAX_QUERIES)) {
    try {
      const results = await fetcher(query);
      sources.push(...results.slice(0, SOURCES_PER_QUERY));
    } catch {
      continue;
    }
  }
  return dedupeSources(sources);
}

function dedupeSources(sources: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const source of sources) {
    const key = source.link || source.title;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

async function safeSummarize(
  deps: AppDependencies,
  essay: string,
  sources: NewsItem[],
  model: string,
): Promise<ResearchSource[]> {
  if (!sources.length) return [];
  try {
    const summarized = await summarizeResearchSources(deps.utilityProvider, { essay, sources, model });
    if (summarized.length) return summarized;
  } catch {
    // Fall through to metadata-only summaries.
  }
  return sources.map(source => ({
    title: source.title,
    link: source.link,
    summary: source.source
      ? `${source.source} headline relevant to the essay: ${source.title}.`
      : `Headline relevant to the essay: ${source.title}.`,
  }));
}

async function safeIntegrate(
  deps: AppDependencies,
  essay: string,
  sources: ResearchSource[],
  model: string,
): Promise<Pick<ResearchResponse, 'integratedEssay' | 'integrationNotes'>> {
  try {
    return await integrateResearchEvidence(deps.utilityProvider, { essay, sources, model });
  } catch {
    return {
      integratedEssay: essay,
      integrationNotes: [],
    };
  }
}
