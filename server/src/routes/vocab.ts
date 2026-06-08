import express, { Router } from 'express';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { enrichWord } from '../brain/enrich.js';
import { selectPrimeWords } from '../brain/prompts.js';
import { config } from '../config.js';
import { parseYoudaoTxt } from '../import/youdao.js';
import {
  getVocabCaptureMeta,
  getVocabCount,
  getVocabList,
  getPrimeCandidatePool,
  incrementVocabSuggested,
  insertVocab,
  normalizeVocabWord,
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
  direction: z.string().optional(),
  contextSentence: z.string().optional(),
  examples: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  register: z.string().optional(),
  captureCount: z.number().int().positive().optional(),
  timesSuggested: z.number().int().nonnegative().optional(),
  timesUsed: z.number().int().nonnegative().optional(),
});

const captureVocabZ = z.object({
  word: z.string().min(1),
  contextSentence: z.string().optional(),
});

const vocabListQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
});

export function createVocabRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/capture', async (req, res, next) => {
    try {
      const body = captureVocabZ.parse(req.body);
      const preview = await enrichWord(deps.utilityProvider, {
        word: body.word,
        contextSentence: body.contextSentence,
        model: config.modelUtility,
      });
      res.json(preview);
    } catch (err) {
      next(err);
    }
  });

  router.post('/save', (req, res, next) => {
    try {
      const body = saveVocabZ.parse(req.body);
      const normalized = normalizeVocabWord(body.normalized ?? body.word);
      const existed = Boolean(getVocabCaptureMeta(deps.db, req.userId, normalized));
      const id = upsertVocab(deps.db, req.userId, {
        ...body,
        source: body.source ?? 'capture',
        timesSuggested: body.timesSuggested ?? 0,
        timesUsed: body.timesUsed ?? 0,
      });
      const saved = getVocabCaptureMeta(deps.db, req.userId, normalized);
      res.status(201).json({
        id,
        captureCount: saved?.captureCount ?? body.captureCount ?? 1,
        existed,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/list', (req, res, next) => {
    try {
      const query = vocabListQueryZ.parse(req.query);
      res.json({
        total: getVocabCount(deps.db, req.userId),
        items: getVocabList(deps.db, req.userId, query.limit),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/import', express.raw({ type: '*/*', limit: '10mb' }), (req, res, next) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
      const vocab = parseYoudaoTxt(body);
      insertVocab(deps.db, req.userId, vocab);
      res.status(201).json({ count: vocab.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/prime', async (req, res, next) => {
    try {
      const promptText = String(req.query.promptText ?? req.query.topic ?? '').trim();
      const parsedLimit = Number(req.query.limit ?? 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(10, Math.floor(parsedLimit)))
        : 10;
      const pool = getPrimeCandidatePool(deps.db, req.userId, promptText, 120);
      const selectedWords = await selectPrimeWords(deps.utilityProvider, {
        topic: promptText,
        vocab: pool.map(v => ({ word: v.word, defCn: v.defCn, kind: v.kind })),
        model: config.modelUtility,
        limit,
      });
      const byNormalized = new Map(pool.map(v => [normalizeVocabWord(v.normalized ?? v.word), v]));
      const selected = new Map<string, (typeof pool)[number]>();
      for (const word of selectedWords) {
        const item = byNormalized.get(normalizeVocabWord(word));
        if (item) selected.set(normalizeVocabWord(item.normalized ?? item.word), item);
        if (selected.size >= limit) break;
      }
      for (const item of pool) {
        selected.set(normalizeVocabWord(item.normalized ?? item.word), item);
        if (selected.size >= limit) break;
      }
      const vocab = Array.from(selected.values()).slice(0, limit);

      incrementVocabSuggested(deps.db, req.userId, vocab.map(v => v.word));
      res.json({ topic: promptText, promptText, limit, vocab });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
