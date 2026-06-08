import { Router } from 'express';
import type { AppDependencies } from '../appContext.js';
import { getActivationStats, getMistakeRanking, getTallies } from '../db/dal.js';

export function createProfileRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      tallies: getTallies(deps.db, req.userId),
      ranking: getMistakeRanking(deps.db, req.userId),
      activation: getActivationStats(deps.db, req.userId),
    });
  });

  return router;
}
