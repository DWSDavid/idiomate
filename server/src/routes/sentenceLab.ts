import { Router } from 'express';
import { z } from 'zod';
import type { Annotation, SentenceLabNote } from '../../../shared/types.js';
import type { AppDependencies } from '../appContext.js';
import { attachBookReferences } from '../brain/chinglishBook.js';
import { retrieveTopK } from '../brain/embedding.js';
import { diagnoseSentence } from '../brain/sentenceLab.js';
import { config } from '../config.js';
import {
  getSentenceLabDraft,
  getSessionEmbeddings,
  getTallies,
  insertSentenceLabDraft,
  recordSentenceLabResult,
} from '../db/dal.js';

const diagnoseRequestZ = z.object({
  sentence: z.string().min(1),
  context: z.string().optional(),
  date: z.string().optional(),
});

const resultRequestZ = z.object({
  id: z.number().int().positive(),
  rewrite: z.string().min(1),
});

function toNotes(annotations: Annotation[]): SentenceLabNote[] {
  return annotations.map(annotation => ({
    span: annotation.span,
    errorType: annotation.errorType,
    hint: annotation.hint,
    explanation: annotation.explanation,
    rule: annotation.rule,
    bookReference: annotation.bookReference,
  }));
}

function withUserRewrite(annotation: Annotation, original: string, rewrite: string) {
  const lower = rewrite.toLowerCase();
  return {
    ...annotation,
    userRewrite: rewrite,
    accepted: annotation.errorType === 'vocab_suggestion'
      ? Boolean(annotation.vocabWord) && lower.includes((annotation.vocabWord ?? '').toLowerCase())
      : rewrite.trim().length > 0 && rewrite !== original,
  };
}

export function createSentenceLabRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/diagnose', async (req, res, next) => {
    try {
      const body = diagnoseRequestZ.parse(req.body);
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
            const qvec = await deps.embeddingProvider.embed(body.sentence.slice(0, 1000));
            snippets = retrieveTopK(stored, qvec, 3).map(result => result.content.slice(0, 200));
          }
        } catch {
          // Memory retrieval should never block Sentence Lab.
        }
      }

      const response = await diagnoseSentence(deps.coachProvider, {
        sentence: body.sentence,
        context: body.context,
        topErrors,
        memoryContext: { topWeaknesses: weaknesses, relevantSnippets: snippets },
        model: config.modelCoach,
      });
      const enriched = {
        ...response,
        annotations: attachBookReferences(response.annotations),
      };
      const id = insertSentenceLabDraft(deps.db, req.userId, {
        date: body.date,
        sentence: body.sentence,
        context: body.context,
        response: enriched,
      });

      res.status(201).json({
        id,
        sentence: body.sentence,
        context: body.context?.trim() || undefined,
        notes: toNotes(enriched.annotations),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/result', (req, res, next) => {
    try {
      const body = resultRequestZ.parse(req.body);
      const draft = getSentenceLabDraft(deps.db, req.userId, body.id);
      if (!draft) {
        res.status(404).json({ error: 'Sentence Lab diagnosis not found.' });
        return;
      }

      recordSentenceLabResult(deps.db, req.userId, body);
      res.json({
        id: draft.id,
        sentence: draft.sentence,
        context: draft.context,
        rewrite: body.rewrite,
        nativeVersion: draft.response.nativeVersion,
        annotations: draft.response.annotations.map(annotation => (
          withUserRewrite(annotation, draft.sentence, body.rewrite)
        )),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
