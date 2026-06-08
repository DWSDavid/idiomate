import type Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';
import { getVocabCount, upsertUser } from '../db/dal.js';
import { seedUserVocab } from '../db/seed.js';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      userName?: string;
    }
  }
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function userMiddleware(db: Database.Database, seedVocabPath = '', autoSeedVocab = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = headerValue(req.headers['x-user-id']).trim();
    const userName = headerValue(req.headers['x-user-name']).trim();
    if (!userId) {
      res.status(400).json({ error: 'Missing x-user-id header.' });
      return;
    }

    upsertUser(db, userId, userName || undefined);
    if (autoSeedVocab && getVocabCount(db, userId) === 0) seedUserVocab(db, userId, seedVocabPath);
    req.userId = userId;
    req.userName = userName || undefined;
    next();
  };
}
