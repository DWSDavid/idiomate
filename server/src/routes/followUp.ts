import { Router } from 'express';
import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';
import type { AppDependencies } from '../appContext.js';
import { answerFollowUp } from '../brain/followUp.js';
import { config } from '../config.js';

const bookReferenceZ = z.object({
  source: z.string().min(1),
  pattern: z.string().min(1),
  quote: z.string().optional(),
  quoteStatus: z.string().optional(),
}).optional();

const followUpAnnotationZ = z.object({
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES),
  hint: z.string().optional(),
  explanation: z.string().optional(),
  rule: z.string().optional(),
  ruleExample: z.object({
    before: z.string().min(1),
    after: z.string().min(1),
  }).optional(),
  bookReference: bookReferenceZ,
  modelRewrite: z.string().optional(),
  userRewrite: z.string().optional(),
});

const followUpRequestZ = z.object({
  scope: z.enum(['sentence_lab', 'paragraph']),
  mode: z.enum(['pre_rewrite', 'post_rewrite']),
  question: z.string().min(1),
  original: z.string().min(1),
  context: z.string().optional(),
  rewrite: z.string().optional(),
  nativeVersion: z.string().optional(),
  annotations: z.array(followUpAnnotationZ).default([]),
});

export function createFollowUpRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = followUpRequestZ.parse(req.body);
      const response = await answerFollowUp(deps.utilityProvider, {
        ...body,
        model: config.modelUtility,
      });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
