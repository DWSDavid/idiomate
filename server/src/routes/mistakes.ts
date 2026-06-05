import { Router } from 'express';
import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';
import type { AppDependencies } from '../appContext.js';
import { getMistakeLog } from '../db/dal.js';

const mistakesQueryZ = z.object({
  type: z.enum(ERROR_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export function createMistakesRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const query = mistakesQueryZ.parse(req.query);
      res.json({
        mistakes: getMistakeLog(deps.db, query.type, query.limit),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
