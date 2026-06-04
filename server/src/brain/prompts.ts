import type { ErrorType, Vocab } from '../../../shared/types.js';
import { ALL_ERROR_TYPES, taxonomySnippet } from './taxonomy.js';

export interface CoachPromptContext {
  paragraph: string;
  paragraphIndex: number;
  topErrors: ErrorType[];
  vocabCandidates: Pick<Vocab, 'word' | 'defCn'>[];
}

function uniqueErrorTypes(types: ErrorType[]): ErrorType[] {
  return Array.from(new Set(types));
}

export function assembleCoachPrompt(ctx: CoachPromptContext): { system: string; user: string } {
  const taxonomyTypes = uniqueErrorTypes([...ctx.topErrors, 'vocab_suggestion']);
  const snippet = taxonomySnippet(taxonomyTypes.length > 1 ? taxonomyTypes : ALL_ERROR_TYPES);
  const vocab = ctx.vocabCandidates.length
    ? ctx.vocabCandidates.map(v => `- ${v.word}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n')
    : '- none';
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';

  return {
    system: [
      'You are a writing coach for an advanced Chinese-L1 writer.',
      'NEVER rewrite the whole text for them as the primary output.',
      'Identify issues, name each by errorType, give a one-line hint that does NOT reveal the fix, and a separate modelRewrite that the UI will hide until the user has tried.',
      'Use vocab_suggestion only for optional vocabulary opportunities. Suggest, never force.',
      'Return ONLY JSON matching: {paragraphIndex, annotations:[{span,errorType,hint,explanation,modelRewrite,vocabWord?}]}.',
    ].join(' '),
    user: [
      `Paragraph index: ${ctx.paragraphIndex}`,
      `Paragraph:\n${ctx.paragraph}`,
      `Top recurring error types: ${topErrors}`,
      `Vocabulary candidates:\n${vocab}`,
      `Taxonomy:\n${snippet}`,
    ].join('\n\n'),
  };
}
