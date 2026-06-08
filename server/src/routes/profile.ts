import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { parseYoudaoTxt } from '../import/youdao.js';
import {
  getActivationStats,
  getMistakeRanking,
  getTallies,
  getVocabCount,
  insertMissingVocab,
  upsertUser,
} from '../db/dal.js';

const rubiProfileZ = z.object({
  code: z.string().min(1),
});

function acceptsRubiProfileCode(code: string): boolean {
  return new Set([
    config.rubiProfileCode,
    config.ownerVocabCode,
    'rubi-vocab',
  ].filter(Boolean)).has(code);
}

export function createProfileRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      tallies: getTallies(deps.db, req.userId),
      ranking: getMistakeRanking(deps.db, req.userId),
      activation: getActivationStats(deps.db, req.userId),
    });
  });

  router.post('/rubi', (req, res, next) => {
    try {
      const body = rubiProfileZ.parse(req.body);
      if (!acceptsRubiProfileCode(body.code)) {
        res.status(403).json({ error: 'Invalid Rubi profile code.' });
        return;
      }

      upsertUser(deps.db, config.rubiProfileUserId, config.rubiProfileName);

      let imported = 0;
      const ownerVocabAvailable = Boolean(config.ownerVocabPath && existsSync(config.ownerVocabPath));
      if (ownerVocabAvailable) {
        const vocab = parseYoudaoTxt(readFileSync(config.ownerVocabPath));
        imported = insertMissingVocab(deps.db, config.rubiProfileUserId, vocab);
      }

      res.json({
        user: {
          id: config.rubiProfileUserId,
          name: config.rubiProfileName,
        },
        imported,
        total: getVocabCount(deps.db, config.rubiProfileUserId),
        ownerVocabAvailable,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
