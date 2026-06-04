import express, { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { parseYoudaoTxt } from '../import/youdao.js';
import {
  getPrimeCandidates,
  incrementVocabSuggested,
  insertVocab,
  upsertVocab,
} from '../db/dal.js';

const vocabKindZ = z.enum(['word', 'phrase', 'collocation']);

const saveVocabZ = z.object({
  word: z.string().min(1),
  normalized: z.string().optional(),
  kind: vocabKindZ.optional(),
  ipa: z.string().optional(),
  defCn: z.string().optional(),
  pos: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  direction: z.enum(['英译中', '中译英', '英译英']).optional(),
  contextSentence: z.string().optional(),
  examples: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  register: z.string().optional(),
  captureCount: z.number().int().positive().optional(),
  timesSuggested: z.number().int().nonnegative().optional(),
  timesUsed: z.number().int().nonnegative().optional(),
});

export function createVocabRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/save', (req, res, next) => {
    try {
      const body = saveVocabZ.parse(req.body);
      const id = upsertVocab(deps.db, {
        ...body,
        source: body.source ?? 'capture',
        timesSuggested: body.timesSuggested ?? 0,
        timesUsed: body.timesUsed ?? 0,
      });
      res.status(201).json({ id });
    } catch (err) {
      next(err);
    }
  });

  router.post('/import', express.raw({ type: '*/*', limit: '10mb' }), (req, res, next) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
      const vocab = parseYoudaoTxt(body);
      insertVocab(deps.db, vocab);
      res.status(201).json({ count: vocab.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/prime', (req, res) => {
    const limit = Number(req.query.limit ?? 5);
    const vocab = getPrimeCandidates(deps.db, Number.isFinite(limit) ? limit : 5);
    incrementVocabSuggested(deps.db, vocab.map(v => v.word));
    res.json({ topic: req.query.topic ?? '', vocab });
  });

  return router;
}
