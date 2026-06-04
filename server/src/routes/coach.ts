import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { coachParagraph } from '../brain/coach.js';
import { getPrimeCandidates, getTallies } from '../db/dal.js';

const coachRequestZ = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  paragraph: z.string().min(1),
});

export function createCoachRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = coachRequestZ.parse(req.body);
      const topErrors = getTallies(deps.db)
        .filter(tally => tally.errorType !== 'vocab_suggestion')
        .slice(0, 3)
        .map(tally => tally.errorType);
      const vocabCandidates = getPrimeCandidates(deps.db, 8).map(v => ({
        word: v.word,
        defCn: v.defCn,
      }));

      const response = await coachParagraph(deps.coachProvider, {
        paragraph: body.paragraph,
        paragraphIndex: body.paragraphIndex,
        topErrors,
        vocabCandidates,
        model: config.modelCoach,
      });

      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
