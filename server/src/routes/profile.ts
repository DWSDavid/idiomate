import { Router } from 'express';
import type { AppDependencies } from '../appContext.js';
import { getActivationStats, getMistakeRanking, getTallies } from '../db/dal.js';

export function createProfileRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      tallies: getTallies(deps.db),
      ranking: getMistakeRanking(deps.db),
      activation: getActivationStats(deps.db),
    });
  });

  return router;
}
