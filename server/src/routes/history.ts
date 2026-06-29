import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { getWritingHistory } from '../db/dal.js';

const historyQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  source: z.enum(['daily_writing', 'free_writing', 'coach_review', 'sentence_lab']).optional(),
});

export function createHistoryRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const query = historyQueryZ.parse(req.query);
      res.json({ entries: getWritingHistory(deps.db, req.userId, query.limit, query.source) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
