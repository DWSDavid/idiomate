import express, { Router } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { AppDependencies } from '../appContext.js';
import { deepDiveWord, enrichWord, translateChineseVocab } from '../brain/enrich.js';
import type { WordDeepDive } from '../brain/schema.js';
import { selectPrimeWords } from '../brain/prompts.js';
import { config } from '../config.js';
import { parseYoudaoTxt } from '../import/youdao.js';
import { autoAddRulePattern } from '../patternScan.js';
import {
  getAllVocab,
  getDeepDiveCache,
  getGraduatedVocab,
  getVocabCount,
  getVocabList,
  getPrimeCandidatePool,
  getReviewQueue,
  getTodayVocab,
  incrementVocabSuggested,
  insertMissingVocab,
  insertVocab,
  mergeVocabFamilies,
  normalizeVocabWord,
  recordReview,
  saveDeepDive,
  upsertVocabWithResult,
} from '../db/dal.js';

const vocabKindZ = z.enum(['word', 'phrase', 'collocation']);
const easeZ = z.enum(['new', 'hard', 'easy']);
const reviewEaseZ = z.enum(['easy', 'hard']);
const nearSynonymZ = z.object({
  word: z.string().min(1),
  distinction: z.string().min(1),
});

const saveVocabZ = z.object({
  word: z.string().min(1),
  normalized: z.string().optional(),
  baseForm: z.string().optional(),
  kind: vocabKindZ.optional(),
  ipa: z.string().optional(),
  defCn: z.string().optional(),
  pos: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  sourceTitle: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  direction: z.string().optional(),
  contextSentence: z.string().optional(),
  examples: z.array(z.string()).optional(),
  collocations: z.array(z.string()).optional(),
  register: z.string().optional(),
  captureCount: z.number().int().positive().optional(),
  ease: easeZ.optional(),
  lastReviewed: z.string().optional(),
  wordFamily: z.array(z.string()).optional(),
  nearSynonyms: z.array(nearSynonymZ).optional(),
  timesSuggested: z.number().int().nonnegative().optional(),
  timesUsed: z.number().int().nonnegative().optional(),
});

const captureVocabZ = z.object({
  word: z.string().min(1),
  contextSentence: z.string().optional(),
});

const chineseVocabZ = z.object({
  text: z.string().min(1),
  contextSentence: z.string().optional(),
});

const vocabListQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const allVocabQueryZ = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(500).default(50),
  sort: z.enum(['date', 'priority']).default('date'),
  source: z.string().optional(),
});

const reviewQueueQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(100).default(10),
});

const todayQueryZ = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const idParamZ = z.object({
  id: z.coerce.number().int().positive(),
});

const reviewBodyZ = z.object({
  ease: reviewEaseZ,
});

const ownerImportZ = z.object({
  code: z.string().min(1),
});

function acceptsOwnerVocabCode(code: string): boolean {
  return new Set([
    config.ownerVocabCode,
    config.rubiProfileCode,
    'rubi-vocab',
  ].filter(Boolean)).has(code);
}

function relatedInYourList(deps: AppDependencies, userId: string, dive: WordDeepDive): string[] {
  const candidates = Array.from(new Set([
    ...dive.wordFamily,
    ...(dive.nearSynonyms ?? []).map(item => item.word),
  ].map(normalizeVocabWord)));
  if (!candidates.length) return [];
  const rows = deps.db.prepare(`
    SELECT word
    FROM vocab
    WHERE user_id = ? AND normalized IN (${candidates.map(() => '?').join(', ')})
    ORDER BY word COLLATE NOCASE ASC
  `).all(userId, ...candidates) as Array<{ word: string }>;
  return rows.map(row => row.word);
}

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
      const saved = upsertVocabWithResult(deps.db, req.userId, {
        ...body,
        source: body.source ?? 'capture',
        captureCount: 1,
        timesSuggested: body.timesSuggested ?? 0,
        timesUsed: body.timesUsed ?? 0,
      });
      // Instantly bank the pattern if this saved phrase already contains a preposition.
      try { autoAddRulePattern(deps.db, req.userId, saved.canonicalWord ?? body.word); } catch { /* never block a save */ }
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  });

  router.post('/from-chinese', async (req, res, next) => {
    try {
      const body = chineseVocabZ.parse(req.body);
      const translated = await translateChineseVocab(deps.utilityProvider, {
        text: body.text.trim(),
        contextSentence: body.contextSentence?.trim() || undefined,
        model: config.modelUtility,
      });
      const saved = upsertVocabWithResult(deps.db, req.userId, translated);
      try { autoAddRulePattern(deps.db, req.userId, saved.canonicalWord ?? translated.word); } catch { /* never block a save */ }
      res.status(201).json({
        id: saved.id,
        captureCount: saved.captureCount,
        previousCaptureCount: saved.previousCaptureCount,
        captureDelta: saved.captureDelta,
        existed: saved.existed,
        canonicalWord: saved.canonicalWord,
        normalized: saved.normalized,
        baseForm: saved.baseForm,
        vocab: {
          ...translated,
          word: saved.canonicalWord ?? translated.word,
          normalized: saved.normalized ?? translated.normalized,
          baseForm: saved.baseForm ?? translated.baseForm,
          id: saved.id,
          captureCount: saved.captureCount,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/capture-save', async (req, res, next) => {
    try {
      const body = captureVocabZ.parse(req.body);
      const enriched = await enrichWord(deps.utilityProvider, {
        word: body.word,
        contextSentence: body.contextSentence,
        model: config.modelUtility,
      });
      const result = upsertVocabWithResult(deps.db, req.userId, {
        ...enriched,
        source: 'capture',
        timesSuggested: 0,
        timesUsed: 0,
      });
      try { autoAddRulePattern(deps.db, req.userId, result.canonicalWord ?? enriched.word); } catch { /* never block a save */ }
      res.status(result.existed ? 200 : 201).json({
        id: result.id,
        captureCount: result.captureCount,
        previousCaptureCount: result.previousCaptureCount,
        captureDelta: result.captureDelta,
        existed: result.existed,
        canonicalWord: result.canonicalWord,
        normalized: result.normalized,
        baseForm: result.baseForm,
        vocab: {
          ...enriched,
          word: result.canonicalWord ?? enriched.word,
          normalized: result.normalized ?? enriched.normalized,
          baseForm: result.baseForm ?? enriched.baseForm,
          id: result.id,
          captureCount: result.captureCount,
        },
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

  router.get('/all', (req, res, next) => {
    try {
      const query = allVocabQueryZ.parse(req.query);
      const sharedWebsiteUserIds = query.source === 'website_reading'
        ? [config.rubiProfileUserId]
        : undefined;
      res.json(getAllVocab(deps.db, req.userId, {
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
        source: query.source,
        userIds: sharedWebsiteUserIds,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/merge-families', (req, res, next) => {
    try {
      res.json(mergeVocabFamilies(deps.db, req.userId));
    } catch (err) {
      next(err);
    }
  });

  router.get('/review-queue', (req, res, next) => {
    try {
      const query = reviewQueueQueryZ.parse(req.query);
      res.json({ items: getReviewQueue(deps.db, req.userId, query.limit) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/today', (req, res, next) => {
    try {
      const query = todayQueryZ.parse(req.query);
      res.json({ items: getTodayVocab(deps.db, req.userId, query.limit) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/review', (req, res, next) => {
    try {
      const params = idParamZ.parse(req.params);
      const body = reviewBodyZ.parse(req.body);
      const existing = deps.db.prepare('SELECT id FROM vocab WHERE id = ? AND user_id = ?')
        .get(params.id, req.userId) as { id: number } | undefined;
      if (!existing) {
        res.status(404).json({ error: 'Vocabulary item not found.' });
        return;
      }
      recordReview(deps.db, req.userId, params.id, body.ease);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/deep-dive', async (req, res, next) => {
    try {
      const params = idParamZ.parse(req.params);
      const item = deps.db.prepare('SELECT word FROM vocab WHERE id = ? AND user_id = ?')
        .get(params.id, req.userId) as { word: string } | undefined;
      if (!item) {
        res.status(404).json({ error: 'Vocabulary item not found.' });
        return;
      }

      const cached = getDeepDiveCache(deps.db, req.userId, params.id);
      const dive = cached ?? await deepDiveWord(deps.utilityProvider, item.word, config.modelUtility);
      if (!cached) {
        saveDeepDive(deps.db, req.userId, params.id, dive);
      }
      res.json({
        ...dive,
        nearSynonyms: dive.nearSynonyms ?? [],
        relatedInYourList: relatedInYourList(deps, req.userId, dive),
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

  router.post('/owner-import', (req, res, next) => {
    try {
      const body = ownerImportZ.parse(req.body);
      if (!acceptsOwnerVocabCode(body.code)) {
        res.status(403).json({ error: 'Invalid owner vocab code.' });
        return;
      }
      if (!config.ownerVocabPath || !existsSync(config.ownerVocabPath)) {
        res.status(400).json({ error: 'Owner vocabulary file is not configured.' });
        return;
      }
      const vocab = parseYoudaoTxt(readFileSync(config.ownerVocabPath));
      const imported = insertMissingVocab(deps.db, req.userId, vocab);
      const total = getVocabCount(deps.db, req.userId);
      res.status(imported ? 201 : 200).json({ imported, total });
    } catch (err) {
      next(err);
    }
  });

  router.get('/graduated', (req, res, next) => {
    try {
      res.json({ items: getGraduatedVocab(deps.db, req.userId) });
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
