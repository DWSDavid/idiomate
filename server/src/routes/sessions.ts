import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { ERROR_TYPES } from '../../../shared/types.js';
import {
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
  recordErrors,
} from '../db/dal.js';

const submittedAnnotationZ = z.object({
  paragraphIdx: z.number().int().nonnegative(),
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  modelRewrite: z.string(),
  userRewrite: z.string().optional(),
  accepted: z.boolean().optional(),
  vocabWord: z.string().optional(),
});

const sessionSubmitZ = z.object({
  date: z.string().optional(),
  promptId: z.number().int().positive().optional(),
  draftText: z.string(),
  finalText: z.string().optional(),
  durationS: z.number().int().nonnegative().optional(),
  annotations: z.array(submittedAnnotationZ).default([]),
});

export function createSessionsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    try {
      const body = sessionSubmitZ.parse(req.body);
      const sessionId = insertSession(deps.db, {
        date: body.date,
        promptId: body.promptId,
        draftText: body.draftText,
        finalText: body.finalText,
        durationS: body.durationS,
      });

      insertAnnotations(deps.db, sessionId, body.annotations);

      const errorTypes = body.annotations
        .map(annotation => annotation.errorType)
        .filter(errorType => errorType !== 'vocab_suggestion');
      recordErrors(deps.db, errorTypes);

      for (const annotation of body.annotations) {
        if (annotation.errorType === 'vocab_suggestion' && annotation.accepted && annotation.vocabWord) {
          incrementVocabUsed(deps.db, annotation.vocabWord);
        }
      }

      res.status(201).json({ id: sessionId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
