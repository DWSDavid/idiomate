import { Router } from 'express';
import { z } from 'zod';
import type { Annotation, SpeakingReviewContext } from '../../../shared/types.js';
import type { AppDependencies } from '../appContext.js';
import { attachBookReferences } from '../brain/chinglishBook.js';
import { retrieveTopK } from '../brain/embedding.js';
import { reviewSpeakingTranscript } from '../brain/speaking.js';
import { config } from '../config.js';
import {
  getSessionEmbeddings,
  getTallies,
  incrementVocabUsed,
  insertAnnotations,
  insertSession,
  recordErrors,
  upsertSessionEmbedding,
} from '../db/dal.js';

const MAX_TRANSCRIPT_CHARS = 8000;

const speakingReviewRequestZ = z.object({
  transcript: z.string().min(1).max(MAX_TRANSCRIPT_CHARS),
  context: z.string().optional(),
  contextLabel: z.string().optional(),
  contextTitle: z.string().optional(),
  contextUrl: z.string().url().optional().or(z.literal('')),
  contextExcerpt: z.string().optional(),
  date: z.string().optional(),
});

function clean(value?: string): string | undefined {
  const next = value?.trim();
  return next || undefined;
}

function contextFromBody(body: z.infer<typeof speakingReviewRequestZ>): SpeakingReviewContext | undefined {
  const context = {
    label: clean(body.contextLabel),
    title: clean(body.contextTitle),
    url: clean(body.contextUrl),
    excerpt: clean(body.contextExcerpt),
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}

function acceptedSpeakingAnnotations(
  annotations: Annotation[],
): Array<Annotation & { paragraphIdx: number; userRewrite?: string; accepted: boolean }> {
  return annotations.map(annotation => ({
    ...annotation,
    paragraphIdx: 0,
    userRewrite: annotation.modelRewrite || annotation.ruleExample?.after,
    accepted: true,
  }));
}

export function createSpeakingRouter(deps: AppDependencies): Router {
  const router = Router();

  router.post('/review', async (req, res, next) => {
    try {
      const body = speakingReviewRequestZ.parse(req.body);
      const transcript = body.transcript.trim();
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
            const qvec = await deps.embeddingProvider.embed(transcript.slice(0, 1000));
            snippets = retrieveTopK(stored, qvec, 3).map(result => result.content.slice(0, 200));
          }
        } catch {
          // Memory retrieval should never block speaking review.
        }
      }

      const reviewed = await reviewSpeakingTranscript(deps.coachProvider, {
        transcript,
        context: clean(body.context),
        contextLabel: clean(body.contextLabel),
        contextTitle: clean(body.contextTitle),
        contextUrl: clean(body.contextUrl),
        contextExcerpt: clean(body.contextExcerpt),
        topErrors,
        memoryContext: { topWeaknesses: weaknesses, relevantSnippets: snippets },
        model: config.modelCoach,
      });
      const enrichedAnnotations = attachBookReferences(reviewed.annotations);
      const context = contextFromBody(body);
      const sessionId = insertSession(deps.db, req.userId, {
        date: body.date,
        draftText: transcript,
        finalText: reviewed.nativeVersion,
        source: 'speaking_review',
        contextLabel: context?.label,
        contextTitle: context?.title,
        contextUrl: context?.url,
        contextExcerpt: context?.excerpt,
      });
      const storedAnnotations = acceptedSpeakingAnnotations(enrichedAnnotations);
      insertAnnotations(deps.db, req.userId, sessionId, storedAnnotations);
      recordErrors(
        deps.db,
        req.userId,
        storedAnnotations
          .map(annotation => annotation.errorType)
          .filter(errorType => errorType !== 'vocab_suggestion'),
      );
      for (const annotation of storedAnnotations) {
        if (annotation.errorType === 'vocab_suggestion' && annotation.vocabWord) {
          incrementVocabUsed(deps.db, req.userId, annotation.vocabWord);
        }
      }

      const embeddingContent = [transcript, reviewed.nativeVersion].join('\n\n').slice(0, 4000);
      try {
        deps.embeddingProvider?.embed(embeddingContent)
          .then(vec => upsertSessionEmbedding(deps.db, sessionId, req.userId, embeddingContent, vec))
          .catch(err => console.error('embed error:', err));
      } catch (err) {
        console.error('embed error:', err);
      }

      res.status(201).json({
        id: sessionId,
        transcript,
        nativeVersion: reviewed.nativeVersion,
        annotations: storedAnnotations,
        takeaways: reviewed.takeaways,
        context,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
