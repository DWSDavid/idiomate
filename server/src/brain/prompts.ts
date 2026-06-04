import type { ErrorType, Vocab } from '../../../shared/types.js';
import { ALL_ERROR_TYPES, taxonomySnippet } from './taxonomy.js';
import type { LLMProvider } from './provider.js';
import { dailyPromptZ, primeWordsZ } from './schema.js';

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

export function assembleDailyPrompt(ctx: { theme: string }): { system: string; user: string } {
  return {
    system: [
      'You generate concise daily writing prompts for Idiomate.',
      'The prompt bank should be finance/tech dominant with occasional professional/workplace themes.',
      'Return ONLY JSON matching: {theme,text}.',
    ].join(' '),
    user: [
      `Requested theme: ${ctx.theme}`,
      'Write one practical prompt for an advanced Chinese-L1 English writer.',
      'The prompt should invite a clear paragraph-length argument, not a list.',
    ].join('\n'),
  };
}

export interface PrimePromptContext {
  topic: string;
  vocab: Pick<Vocab, 'word' | 'defCn' | 'kind'>[];
}

export function assemblePrimePrompt(ctx: PrimePromptContext): { system: string; user: string } {
  const vocab = ctx.vocab.map(v => `- ${v.word}${v.kind ? ` (${v.kind})` : ''}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n');
  return {
    system: [
      'You select vocabulary activation candidates for a writing practice session.',
      'Choose 3 to 5 words or phrases that naturally fit the topic.',
      'Prioritize phrases and collocations when they fit.',
      'Return ONLY JSON matching: {words:[string,string,string]}.',
    ].join(' '),
    user: [
      `Topic: ${ctx.topic}`,
      `User vocabulary candidates:\n${vocab || '- none'}`,
    ].join('\n\n'),
  };
}

export async function generateDailyPrompt(
  provider: LLMProvider,
  ctx: { theme: string; model: string },
): Promise<{ theme: string; text: string }> {
  const { system, user } = assembleDailyPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return dailyPromptZ.parse(JSON.parse(raw));
}

export async function selectPrimeWords(
  provider: LLMProvider,
  ctx: PrimePromptContext & { model: string },
): Promise<string[]> {
  const { system, user } = assemblePrimePrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return primeWordsZ.parse(JSON.parse(raw)).words;
}
