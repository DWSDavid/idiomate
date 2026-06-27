import { Router } from 'express';
import type { AppDependencies } from '../appContext.js';
import { getMemoryProfile } from '../db/dal.js';

export function createMemoryRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/profile', (req, res, next) => {
    try {
      res.json(getMemoryProfile(deps.db, req.userId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
