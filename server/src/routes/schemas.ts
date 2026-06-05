import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';

export const submittedAnnotationZ = z.object({
  paragraphIdx: z.number().int().nonnegative().optional(),
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  rule: z.string().optional(),
  ruleExample: z.object({
    before: z.string().min(1),
    after: z.string().min(1),
  }).optional(),
  modelRewrite: z.string(),
  userRewrite: z.string().optional(),
  accepted: z.boolean().optional(),
  vocabWord: z.string().optional(),
});
