import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { attachBookReferences } from '../brain/chinglishBook.js';
import { coachParagraph } from '../brain/coach.js';
import { retrieveTopK } from '../brain/embedding.js';
import { assembleElevatePrompt } from '../brain/prompts.js';
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

      let elevatedVersion: string | undefined;
      let elevationNotes: string | undefined;
      if (response.nativeVersion) {
        try {
          const elevatePrompt = assembleElevatePrompt({
            paragraph: body.paragraph,
            nativeVersion: response.nativeVersion,
          });
          const elevateRaw = await deps.utilityProvider.complete({
            system: elevatePrompt.system,
            user: elevatePrompt.user,
            model: config.modelUtility,
          });
          const elevateJson = JSON.parse(elevateRaw) as { elevatedVersion?: string; elevationNotes?: string };
          if (typeof elevateJson.elevatedVersion === 'string') {
            elevatedVersion = elevateJson.elevatedVersion;
          }
          if (typeof elevateJson.elevationNotes === 'string') {
            elevationNotes = elevateJson.elevationNotes;
          }
        } catch {
          // Elevation is best-effort; coach still returns successfully without it.
        }
      }

      res.json({
        ...response,
        annotations: attachBookReferences(response.annotations),
        ...(elevatedVersion !== undefined ? { elevatedVersion } : {}),
        ...(elevationNotes !== undefined ? { elevationNotes } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
