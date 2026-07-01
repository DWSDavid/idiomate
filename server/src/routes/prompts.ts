import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { extractSourceQuotes, generateNewsPrompt } from '../brain/prompts.js';
import { config } from '../config.js';
import {
  getMemoryProfile,
  getPromptLibrary,
  insertGeneratedPrompt,
  markPromptUsed,
  setPromptSaved,
} from '../db/dal.js';
import type { SourceQuote } from '../../../shared/types.js';
import { fetchArticleText, fetchHeadlines, fetchNews, NEWS_TOPICS } from '../news.js';

const OFFLINE_FALLBACK = {
  theme: 'professional discussion',
  text: 'What is your view on how professionals should make careful decisions when fresh information is limited?',
  essayPrompt: 'Some argue professionals should act decisively even when information is scarce, while others say they should wait for more evidence. Take a clear side and defend it with reasons, then address the strongest objection to your view.',
};

// Bound the quote step: fetching several articles + an extra LLM call must not stall the
// daily prompt, so we only try the top few links and swallow any failure.
const MAX_QUOTE_ARTICLES = 3;

const promptLibraryQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  saved: z.enum(['true', 'false']).optional(),
});

const idParamZ = z.object({
  id: z.coerce.number().int().positive(),
});

const savePromptBodyZ = z.object({
  saved: z.boolean().default(true),
});

export function createPromptsRouter(deps: AppDependencies): Router {
  const router = Router();
  let topicCursor = 0;

  router.get('/library', (req, res, next) => {
    try {
      const query = promptLibraryQueryZ.parse(req.query);
      res.json({
        prompts: getPromptLibrary(deps.db, req.userId, {
          limit: query.limit,
          savedOnly: query.saved === 'true',
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/save', (req, res, next) => {
    try {
      const { id } = idParamZ.parse(req.params);
      const body = savePromptBodyZ.parse(req.body);
      const prompt = setPromptSaved(deps.db, req.userId, id, body.saved);
      if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
      res.json(prompt);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/use', (req, res, next) => {
    try {
      const { id } = idParamZ.parse(req.params);
      const prompt = markPromptUsed(deps.db, req.userId, id);
      if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
      res.json(prompt);
    } catch (err) {
      next(err);
    }
  });

  router.get('/today', async (req, res) => {
    const date = new Date().toISOString().slice(0, 10);
    const requestedTopic = String(req.query.topic ?? '').trim();
    const topic = requestedTopic || NEWS_TOPICS[topicCursor % NEWS_TOPICS.length];
    topicCursor += 1;

    const fetcher = deps.headlineFetcher ?? fetchHeadlines;
    let headlines: string[] = [];
    try {
      headlines = await fetcher(topic);
    } catch {
      headlines = [];
    }

    const newsFetcher = deps.newsFetcher ?? fetchNews;
    const newsItemsPromise = newsFetcher(topic).catch(() => []);
    const profile = getMemoryProfile(deps.db, req.userId);
    const topErrors = profile.topWeaknesses.slice(0, 3).map(item => item.errorType);
    const recentPrompts = getPromptLibrary(deps.db, req.userId, { limit: 8 });
    const previousPrompts = recentPrompts.map(item => item.text);
    const previousTheme = recentPrompts[0]?.theme;

    try {
      const [prompt, newsItems] = await Promise.all([
        generateNewsPrompt(deps.utilityProvider, {
          topic,
          headlines,
          model: config.modelUtility,
          topErrors,
          previousPrompts,
          previousTheme,
        }),
        newsItemsPromise,
      ]);
      const topNews = newsItems.slice(0, 3);
      const sourceQuotes = await extractQuotes(deps, prompt.text, topNews);
      const stored = insertGeneratedPrompt(deps.db, req.userId, {
        date,
        ...prompt,
        newsItems: topNews,
        sourceQuotes,
        source: 'generated',
      });
      res.json(stored);
    } catch {
      const stored = insertGeneratedPrompt(deps.db, req.userId, {
        date,
        ...OFFLINE_FALLBACK,
        newsItems: [],
        source: 'fallback',
      });
      res.json(stored);
    }
  });

  async function extractQuotes(
    deps: AppDependencies,
    promptText: string,
    newsItems: Array<{ title: string; link: string; source?: string }>,
  ): Promise<SourceQuote[]> {
    const fetcher = deps.articleFetcher ?? fetchArticleText;
    const candidates = newsItems.filter(item => item.link).slice(0, MAX_QUOTE_ARTICLES);
    if (!candidates.length) return [];

    try {
      const articles = await Promise.all(candidates.map(async item => ({
        title: item.title,
        link: item.link,
        source: item.source,
        text: await fetcher(item.link).catch(() => ''),
      })));
      return await extractSourceQuotes(deps.utilityProvider, {
        promptText,
        articles,
        model: config.modelUtility,
      });
    } catch {
      // Quotes are a bonus; never fail the daily prompt because a source could not be read.
      return [];
    }
  }

  return router;
}
