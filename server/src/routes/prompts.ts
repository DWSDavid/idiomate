import { Router } from 'express';
import type { AppDependencies } from '../appContext.js';
import { generateNewsPrompt } from '../brain/prompts.js';
import { config } from '../config.js';
import { fetchHeadlines, fetchNews, NEWS_TOPICS } from '../news.js';

const OFFLINE_FALLBACK = {
  theme: 'professional discussion',
  text: 'What is your view on how professionals should make careful decisions when fresh information is limited?',
};

export function createPromptsRouter(deps: AppDependencies): Router {
  const router = Router();
  let topicCursor = 0;

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

    try {
      const [prompt, newsItems] = await Promise.all([
        generateNewsPrompt(deps.utilityProvider, {
          topic,
          headlines,
          model: config.modelUtility,
        }),
        newsItemsPromise,
      ]);
      res.json({ date, ...prompt, newsItems: newsItems.slice(0, 3) });
    } catch {
      res.json({ date, ...OFFLINE_FALLBACK, newsItems: [] });
    }
  });

  return router;
}
