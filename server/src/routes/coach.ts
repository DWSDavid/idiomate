import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { attachBookReferences } from '../brain/chinglishBook.js';
import { coachParagraph } from '../brain/coach.js';
import { retrieveTopK } from '../brain/embedding.js';
import { getPrimeCandidates, getSessionEmbeddings, getTallies } from '../db/dal.js';

const coachRequestZ = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  paragraph: z.string().min(1),
});

export function createCoachRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = coachRequestZ.parse(req.body);
      const tallies = getTallies(deps.db, req.userId);
      const topErrors = tallies
        .filter(tally => tally.errorType !== 'vocab_suggestion')
        .slice(0, 3)
        .map(tally => tally.errorType);
      const weaknesses = tallies.slice(0, 3).map(tally => tally.errorType);
      let snippets: string[] = [];
      if (deps.embeddingProvider) {
        try {
          const stored = getSessionEmbeddings(deps.db, req.userId);
          if (stored.length) {
            const qvec = await deps.embeddingProvider.embed(body.paragraph.slice(0, 1000));
            snippets = retrieveTopK(stored, qvec, 3).map(result => result.content.slice(0, 200));
          }
        } catch {
          // Memory retrieval should never block coaching.
        }
      }
      const vocabCandidates = getPrimeCandidates(deps.db, req.userId, 8).map(v => ({
        word: v.word,
        defCn: v.defCn,
      }));

      const response = await coachParagraph(deps.coachProvider, {
        paragraph: body.paragraph,
        paragraphIndex: body.paragraphIndex,
        topErrors,
        vocabCandidates,
        memoryContext: { topWeaknesses: weaknesses, relevantSnippets: snippets },
        model: config.modelCoach,
      });

      res.json({
        ...response,
        annotations: attachBookReferences(response.annotations),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
