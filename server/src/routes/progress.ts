import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { getDailyMistakeCounts, getMistakeTrend } from '../db/dal.js';

const progressQueryZ = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
  topN: z.coerce.number().int().positive().max(10).default(3),
});

export function createProgressRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const query = progressQueryZ.parse(req.query);
      res.json({
        daily: getDailyMistakeCounts(deps.db, req.userId, query.days),
        trend: getMistakeTrend(deps.db, req.userId, query.days, query.topN),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
