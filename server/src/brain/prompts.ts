import type { ErrorType, Vocab } from '../../../shared/types.js';
import { ERROR_TYPES } from '../../../shared/types.js';
import { ALL_ERROR_TYPES, ERROR_TAXONOMY } from './taxonomy.js';
import { GRAMMAR_RULES, type GrammarRule, rulesForTypes } from './rules.js';
import type { LLMProvider } from './provider.js';
import { dailyPromptZ, primeWordsZ } from './schema.js';

export interface CoachPromptContext {
  paragraph: string;
  paragraphIndex: number;
  topErrors: ErrorType[];
  vocabCandidates: Pick<Vocab, 'word' | 'defCn'>[];
}

function taxonomyReferenceSnippet(types: ErrorType[]): string {
  const seen = new Set<ErrorType>();
  const lines: string[] = [];
  for (const type of types) {
    if (seen.has(type)) continue;
    seen.add(type);
    const entry = ERROR_TAXONOMY[type];
    if (!entry) continue;
    lines.push(`- [${type}] ${entry.name}: ${entry.whatItIs}`);
  }
  return lines.join('\n');
}

function rulesReferenceSnippet(rules: GrammarRule[] = GRAMMAR_RULES): string {
  return rules
    .map(rule => `- ${rule.name}: ${rule.principle}`)
    .join('\n');
}

export function assembleCoachPrompt(ctx: CoachPromptContext): { system: string; user: string } {
  const snippet = taxonomyReferenceSnippet(ALL_ERROR_TYPES);
  const focusedRules = rulesForTypes(ctx.topErrors);
  const ruleSnippet = rulesReferenceSnippet(focusedRules.length ? focusedRules : undefined);
  const vocab = ctx.vocabCandidates.length
    ? ctx.vocabCandidates.map(v => `- ${v.word}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n')
    : '- none';
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';

  return {
    system: [
      'You are a writing coach for an advanced Chinese-L1 writer.',
      'NEVER rewrite the whole text for them as the primary output.',
      'Identify issues, name each by errorType, set the most specific named rule, give a one-line hint that does NOT reveal the fix, a one-line explanation of why, a short ruleExample, and a separate modelRewrite that the UI will hide until the user has tried.',
      "For ruleExample, ruleExample.before MUST come from the user's own text for this exact issue, or be closely based on that text. ruleExample.after MUST be the corrected form of that same minimal pair. NEVER copy the example sentences from the Taxonomy or Rules sections; those references are for classification only, not output. If no faithful minimal pair fits, generate a fresh pair specific to this user's error and do not reuse a reference example.",
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name (for example "Gerund after certain verbs") in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a fully natural version of the whole paragraph. The UI hides both modelRewrite and nativeVersion until the user submits their own rewrite.',
      'Use vocab_suggestion only for optional vocabulary opportunities. Suggest, never force.',
      'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?}]}.',
    ].join(' '),
    user: [
      `Paragraph index: ${ctx.paragraphIndex}`,
      `Paragraph:\n${ctx.paragraph}`,
      `Prioritize these recurring error types when relevant: ${topErrors}`,
      `Vocabulary candidates:\n${vocab}`,
      `Taxonomy:\n${snippet}`,
      `Named grammar and Chinglish rules:\n${ruleSnippet}`,
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

export function assembleNewsPrompt(ctx: { topic: string; headlines: string[] }): { system: string; user: string } {
  const headlines = ctx.headlines.length
    ? ctx.headlines.map((headline, index) => `${index + 1}. ${headline}`).join('\n')
    : 'No fresh headlines were available. Generate a timely but non-specific discussion prompt from the topic alone.';

  return {
    system: [
      'You generate one fresh discussion-style writing prompt for Idiomate.',
      'Aim it at academic writing and professional discussion prep for an advanced Chinese-L1 English writer.',
      'Ground the prompt in the supplied headlines when they are available.',
      'The prompt should start naturally, often with "What\'s your view on", and invite a paragraph-length argument rather than a list.',
      'Return ONLY JSON matching: {theme,text}.',
    ].join(' '),
    user: [
      `Topic: ${ctx.topic}`,
      `Headlines:\n${headlines}`,
      'Write one fresh prompt with a concrete angle. Do not copy a headline verbatim.',
      "What's your view prompt:",
    ].join('\n\n'),
  };
}

export interface PrimePromptContext {
  topic: string;
  vocab: Pick<Vocab, 'word' | 'defCn' | 'kind'>[];
  limit?: number;
}

export function assemblePrimePrompt(ctx: PrimePromptContext): { system: string; user: string } {
  const vocab = ctx.vocab.map(v => `- ${v.word}${v.kind ? ` (${v.kind})` : ''}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n');
  const limit = ctx.limit ?? 10;
  return {
    system: [
      'You select vocabulary activation candidates for a writing practice session.',
      `Choose up to ${limit} words, phrases, or collocations that naturally fit the full prompt text.`,
      'Favor phrases and collocations, especially terms useful for academic or professional writing.',
      'Use recency and memory value only as secondary signals; relevance to the prompt wins.',
      'Return ONLY JSON matching: {words:[string]}.',
    ].join(' '),
    user: [
      `Full prompt text: ${ctx.topic}`,
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

export async function generateNewsPrompt(
  provider: LLMProvider,
  ctx: { topic: string; headlines: string[]; model: string },
): Promise<{ theme: string; text: string }> {
  const { system, user } = assembleNewsPrompt(ctx);
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
