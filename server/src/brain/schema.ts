import { z } from 'zod';
import { ERROR_TYPES } from '../../../shared/types.js';

export const annotationZ = z.object({
  span: z.string().min(1),
  errorType: z.enum(ERROR_TYPES),
  hint: z.string().min(1),
  explanation: z.string().min(1),
  modelRewrite: z.string(),
  vocabWord: z.string().optional(),
});

export const coachResponseZ = z.object({
  paragraphIndex: z.number(),
  annotations: z.array(annotationZ),
});
