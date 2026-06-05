import { Router } from 'express';
import { z } from 'zod';
import type { ErrorType, LessonComparisonPair } from '../../../shared/types.js';
import { ERROR_TYPES } from '../../../shared/types.js';
import { generateLesson } from '../brain/lessons.js';
import { ERROR_TAXONOMY } from '../brain/taxonomy.js';
import { rulesForTypes } from '../brain/rules.js';
import type { AppDependencies } from '../appContext.js';
import { config } from '../config.js';
import { getMistakeLog, getMistakeRanking } from '../db/dal.js';

const lessonQueryZ = z.object({
  type: z.enum(ERROR_TYPES).optional(),
});

function defaultErrorType(deps: AppDependencies): ErrorType {
  return getMistakeRanking(deps.db)
    .filter(item => item.errorType !== 'vocab_suggestion')[0]?.errorType ?? 'small_grammar';
}

function bookReferenceFor(principle: string, example?: LessonComparisonPair) {
  return {
    source: "The Translator's Guide to Chinglish",
    pattern: principle,
    quoteStatus: 'Attach the PDF to show exact source quotes.',
    exampleBefore: example?.before,
    exampleAfter: example?.after,
  };
}

function lessonRules(errorType: ErrorType) {
  const grammarRules = rulesForTypes([errorType]);
  if (grammarRules.length) {
    return grammarRules.map(rule => ({
      name: rule.name,
      principle: rule.principle,
      mindset: rule.mindset,
      example: rule.example,
      bookReference: bookReferenceFor(rule.principle, rule.example),
    }));
  }

  const taxonomy = ERROR_TAXONOMY[errorType];
  const example = taxonomy.examples[0] ? {
    before: taxonomy.examples[0].before,
    after: taxonomy.examples[0].after,
    note: taxonomy.examples[0].note,
  } : undefined;
  return [{
    name: taxonomy.name,
    principle: taxonomy.whatItIs,
    example,
    bookReference: bookReferenceFor(taxonomy.whatItIs, example),
  }];
}

function seedPairsFor(errorType: ErrorType, rules: ReturnType<typeof lessonRules>): LessonComparisonPair[] {
  const fromRules = rules
    .map(rule => rule.example)
    .filter((pair): pair is LessonComparisonPair => Boolean(pair));
  if (fromRules.length) return fromRules;

  return (ERROR_TAXONOMY[errorType]?.examples ?? [])
    .map(example => ({ before: example.before, after: example.after, note: example.note }));
}

export function createLessonsRouter(deps: AppDependencies): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const query = lessonQueryZ.parse(req.query);
      const errorType = query.type ?? defaultErrorType(deps);
      const rules = lessonRules(errorType);
      const seedPairs = seedPairsFor(errorType, rules).slice(0, 3);
      const pastInstances = getMistakeLog(deps.db, errorType, 6);
      const generated = await generateLesson(deps.utilityProvider, {
        errorType,
        rules,
        pastInstances,
        seedPairs,
        model: config.modelUtility,
      });

      res.json({
        errorType,
        rules: rules.map(({ example: _example, ...rule }) => rule),
        principle: generated.principle,
        mindset: generated.mindset,
        pastInstances,
        comparisonPairs: generated.comparisonPairs,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
