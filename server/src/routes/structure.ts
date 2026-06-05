import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { generateStructureGuidance } from '../brain/structure.js';
import { config } from '../config.js';

const structureBodyZ = z.object({
  draft: z.string().min(1),
});

export function createStructureRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const { draft } = structureBodyZ.parse(req.body);
      const guidance = await generateStructureGuidance(deps.utilityProvider, {
        draft,
        model: config.modelUtility,
      });
      res.json(guidance);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
