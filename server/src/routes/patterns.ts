import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { buildPatternCue, detectPreposition } from '../../../shared/types.js';
import { checkPatternUsage } from '../brain/patterns.js';
import { config } from '../config.js';
import {
  deletePattern,
  insertPattern,
  listPatterns,
  recordPatternReview,
} from '../db/dal.js';

const addPatternZ = z.object({
  phrase: z.string().min(2),
  preposition: z.string().min(1).optional(),
  example: z.string().optional(),
  note: z.string().optional(),
});

const idParamZ = z.object({
  id: z.coerce.number().int().positive(),
});

const reviewBodyZ = z.object({
  correct: z.boolean(),
});

const usageCheckZ = z.object({
  phrase: z.string().min(2),
  preposition: z.string().min(1),
  sentence: z.string().min(1),
});

export function createPatternsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      res.json({ items: listPatterns(deps.db, req.userId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = addPatternZ.parse(req.body);
      const phrase = body.phrase.trim();
      // Fall back to auto-detection when the client did not supply the gap word.
      const preposition = (body.preposition?.trim() || detectPreposition(phrase)).toLowerCase();
      if (!preposition) {
        res.status(422).json({ error: 'Could not find a preposition to blank. Please specify one.' });
        return;
      }
      const cue = buildPatternCue(phrase, preposition);
      const pattern = insertPattern(deps.db, req.userId, {
        phrase,
        preposition,
        cue,
        example: body.example?.trim() || undefined,
        note: body.note?.trim() || undefined,
      });
      res.status(201).json(pattern);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/review', (req, res, next) => {
    try {
      const params = idParamZ.parse(req.params);
      const body = reviewBodyZ.parse(req.body);
      const pattern = recordPatternReview(deps.db, req.userId, params.id, body.correct);
      if (!pattern) {
        res.status(404).json({ error: 'Pattern not found.' });
        return;
      }
      res.json(pattern);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const params = idParamZ.parse(req.params);
      const removed = deletePattern(deps.db, req.userId, params.id);
      if (!removed) {
        res.status(404).json({ error: 'Pattern not found.' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/check-usage', async (req, res, next) => {
    try {
      const body = usageCheckZ.parse(req.body);
      const result = await checkPatternUsage(deps.utilityProvider, {
        phrase: body.phrase.trim(),
        preposition: body.preposition.trim(),
        sentence: body.sentence.trim(),
        model: config.modelUtility,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
