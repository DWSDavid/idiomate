import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { getAdminUserSummary, getVocabCount, getVocabList, getWritingHistory, listAdminUsers } from '../db/dal.js';
import { flushListenQueue } from '../listen.js';

const adminDetailParamsZ = z.object({
  userId: z.string().min(1),
});

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function acceptsAdminCode(code: string): boolean {
  return new Set([
    config.adminCode,
    'rubi-admin',
  ].filter(Boolean)).has(code);
}

function requireAdminCode(req: Request, res: Response): boolean {
  const code = headerValue(req.headers['x-admin-code']).trim();
  if (!acceptsAdminCode(code)) {
    res.status(403).json({ error: 'Invalid admin code.' });
    return false;
  }
  return true;
}

export function createAdminRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/users', (req, res, next) => {
    try {
      if (!requireAdminCode(req, res)) return;
      res.json({ users: listAdminUsers(deps.db) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/users/:userId', (req, res, next) => {
    try {
      if (!requireAdminCode(req, res)) return;
      const { userId } = adminDetailParamsZ.parse(req.params);
      const user = getAdminUserSummary(deps.db, userId);
      if (!user) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({
        user,
        vocab: {
          total: getVocabCount(deps.db, userId),
          items: getVocabList(deps.db, userId, 500),
        },
        history: {
          entries: getWritingHistory(deps.db, userId, 500),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/listen/flush', (req, res, next) => {
    try {
      if (!requireAdminCode(req, res)) return;
      const result = flushListenQueue(deps.db, config.rubiProfileUserId);
      res.json({ ok: true, inserted: result.inserted, skipped: result.skipped });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
