import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import {
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
  recordErrors,
  upsertSessionEmbedding,
} from '../db/dal.js';
import { submittedAnnotationZ } from './schemas.js';

const sessionSubmitZ = z.object({
  date: z.string().optional(),
  promptId: z.number().int().positive().optional(),
  draftText: z.string(),
  finalText: z.string().optional(),
  durationS: z.number().int().nonnegative().optional(),
  annotations: z.array(submittedAnnotationZ.extend({
    paragraphIdx: z.number().int().nonnegative(),
  })).default([]),
  primedVocab: z.array(z.string()).optional(),
});

export function countVocabUsed(primedVocab: string[], draftText: string, finalText?: string): number {
  if (!primedVocab.length) return 0;
  const combined = (draftText + ' ' + (finalText ?? '')).toLowerCase();
  return primedVocab.filter(word => combined.includes(word.toLowerCase())).length;
}

export function createSessionsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    try {
      const body = sessionSubmitZ.parse(req.body);
      const sessionId = insertSession(deps.db, req.userId, {
        date: body.date,
        promptId: body.promptId,
        draftText: body.draftText,
        finalText: body.finalText,
        durationS: body.durationS,
      });

      insertAnnotations(deps.db, req.userId, sessionId, body.annotations);

      const errorTypes = body.annotations
        .map(annotation => annotation.errorType)
        .filter(errorType => errorType !== 'vocab_suggestion');
      recordErrors(deps.db, req.userId, errorTypes);

      for (const annotation of body.annotations) {
        if (annotation.errorType === 'vocab_suggestion' && annotation.accepted && annotation.vocabWord) {
          incrementVocabUsed(deps.db, req.userId, annotation.vocabWord);
        }
      }

      const content = [body.draftText, body.finalText].filter(Boolean).join('\n\n').slice(0, 4000);
      try {
        deps.embeddingProvider?.embed(content)
          .then(vec => upsertSessionEmbedding(deps.db, sessionId, req.userId, content, vec))
          .catch(err => console.error('embed error:', err));
      } catch (err) {
        console.error('embed error:', err);
      }

      const primedVocab = body.primedVocab ?? [];
      const vocabUsed = countVocabUsed(primedVocab, body.draftText, body.finalText);
      const vocabTotal = primedVocab.length;

      res.status(201).json({ id: sessionId, vocabUsed, vocabTotal });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
