import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { graduateVocabWords, recordParagraphResult } from '../db/dal.js';
import { submittedAnnotationZ } from './schemas.js';

const paragraphResultZ = z.object({
  date: z.string().optional(),
  promptId: z.number().int().positive().optional(),
  paragraphIdx: z.number().int().nonnegative(),
  paragraph: z.string().min(1),
  rewrite: z.string().min(1),
  nativeText: z.string().optional(),
  elevatedText: z.string().optional(),
  evidenceText: z.string().optional(),
  annotations: z.array(submittedAnnotationZ).default([]),
});

function detectGraduations(
  deps: AppDependencies,
  userId: string,
  rewrite: string,
  errorSpans: string[],
): void {
  const rows = deps.db.prepare(`
    SELECT normalized
    FROM vocab
    WHERE user_id = ? AND COALESCE(graduated, 0) = 0
  `).all(userId) as Array<{ normalized: string }>;

  const rewriteLower = rewrite.toLowerCase();
  const toGraduate: string[] = [];
  for (const row of rows) {
    const norm = row.normalized;
    if (!rewriteLower.includes(norm)) continue;
    const usedInError = errorSpans.some(span => span.toLowerCase().includes(norm));
    if (!usedInError) toGraduate.push(norm);
  }

  if (toGraduate.length) {
    graduateVocabWords(deps.db, userId, toGraduate);
  }
}

export function createParagraphsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', (req, res, next) => {
    try {
      const body = paragraphResultZ.parse(req.body);
      const result = recordParagraphResult(deps.db, req.userId, body);

      const errorSpans = body.annotations
        .filter(a => a.errorType !== 'vocab_suggestion')
        .map(a => a.span);
      detectGraduations(deps, req.userId, body.rewrite, errorSpans);

      res.status(result.created ? 201 : 200).json({ id: result.sessionId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
