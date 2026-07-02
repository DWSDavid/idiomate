import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { analyzeFlow, checkFlowDrill } from '../brain/flow.js';
import { config } from '../config.js';
import { getVocabSample } from '../db/dal.js';

const analyzeRequestZ = z.object({
  draft: z.string().min(12),
  context: z.string().optional(),
});

const drillCheckRequestZ = z.object({
  drillPrompt: z.string().min(1),
  targetSkill: z.string().min(1),
  attempt: z.string().min(1),
});

// How many saved words to offer the model as drill seeds. Enough variety without
// bloating the prompt.
const VOCAB_SEED_COUNT = 24;

export function createFlowRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/analyze', async (req, res, next) => {
    try {
      const body = analyzeRequestZ.parse(req.body);
      const vocab = getVocabSample(deps.db, req.userId, VOCAB_SEED_COUNT).map(item => item.word);
      const response = await analyzeFlow(deps.utilityProvider, {
        draft: body.draft,
        context: body.context,
        vocab,
        model: config.modelUtility,
      });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  router.post('/drill/check', async (req, res, next) => {
    try {
      const body = drillCheckRequestZ.parse(req.body);
      const response = await checkFlowDrill(deps.utilityProvider, {
        drillPrompt: body.drillPrompt,
        targetSkill: body.targetSkill,
        attempt: body.attempt,
        model: config.modelUtility,
      });
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
