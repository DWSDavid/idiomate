import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { insertAnnotations, insertSession } from '../db/dal.js';
import { submittedAnnotationZ } from './schemas.js';

const coachHistoryZ = z.object({
  date: z.string().optional(),
  promptId: z.number().int().positive().optional(),
  paragraphIdx: z.number().int().nonnegative(),
  paragraph: z.string().min(1),
  annotations: z.array(submittedAnnotationZ).default([]),
});

export function createCoachHistoryRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    try {
      const body = coachHistoryZ.parse(req.body);
      const sessionId = insertSession(deps.db, req.userId, {
        date: body.date,
        promptId: body.promptId,
        draftText: body.paragraph,
        source: 'coach_review',
      });

      insertAnnotations(deps.db, req.userId, sessionId, body.annotations.map(annotation => ({
        ...annotation,
        paragraphIdx: body.paragraphIdx,
        accepted: false,
      })));

      res.status(201).json({ id: sessionId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
