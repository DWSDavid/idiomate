import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { recordParagraphResult } from '../db/dal.js';
import { submittedAnnotationZ } from './schemas.js';

const paragraphResultZ = z.object({
  date: z.string().optional(),
  promptId: z.number().int().positive().optional(),
  paragraphIdx: z.number().int().nonnegative(),
  paragraph: z.string().min(1),
  rewrite: z.string().min(1),
  annotations: z.array(submittedAnnotationZ).default([]),
});

export function createParagraphsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    try {
      const body = paragraphResultZ.parse(req.body);
      const result = recordParagraphResult(deps.db, req.userId, body);
      res.status(result.created ? 201 : 200).json({ id: result.sessionId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
