import express from 'express';
import { fileURLToPath } from 'node:url';
import type { AppDependencies } from './appContext.js';
import { OpenAIProvider } from './brain/openai.js';
import { config } from './config.js';
import { migrate, openDb } from './db/db.js';
import { createCoachRouter } from './routes/coach.js';
import { createLessonsRouter } from './routes/lessons.js';
import { createMistakesRouter } from './routes/mistakes.js';
import { createParagraphsRouter } from './routes/paragraphs.js';
import { createProfileRouter } from './routes/profile.js';
import { createPromptsRouter } from './routes/prompts.js';
import { createResearchRouter } from './routes/research.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createStructureRouter } from './routes/structure.js';
import { createVocabRouter } from './routes/vocab.js';

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const db = overrides.db ?? openDb();
  migrate(db);

  const deps: AppDependencies = {
    db,
    coachProvider: overrides.coachProvider ?? new OpenAIProvider(config.apiKey),
    utilityProvider: overrides.utilityProvider ?? new OpenAIProvider(config.apiKey),
    headlineFetcher: overrides.headlineFetcher,
    newsFetcher: overrides.newsFetcher,
  };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/coach', createCoachRouter(deps));
  app.use('/api/lesson', createLessonsRouter(deps));
  app.use('/api/mistakes', createMistakesRouter(deps));
  app.use('/api/paragraph-result', createParagraphsRouter(deps));
  app.use('/api/prompt', createPromptsRouter(deps));
  app.use('/api/sessions', createSessionsRouter(deps));
  app.use('/api/structure', createStructureRouter(deps));
  app.use('/api/vocab', createVocabRouter(deps));
  app.use('/api/profile', createProfileRouter(deps));
  app.use('/api/research', createResearchRouter(deps));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    res.status(400).json({ error: message });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(config.port, () => {
    console.log(`Idiomate server listening on http://localhost:${config.port}`);
  });
}
