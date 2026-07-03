import type { PatternUsageCheckResponse } from '../../../shared/types.js';
import { PREPOSITIONS } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { patternExtractionZ, patternUsageCheckZ } from './schema.js';

export interface ExtractedCombo {
  phrase: string;
  preposition: string;
}

export interface PatternUsageContext {
  phrase: string;
  preposition: string;
  sentence: string;
}

export function assemblePatternUsagePrompt(ctx: PatternUsageContext): { system: string; user: string } {
  return {
    system: [
      'You check whether a learner used a fixed prepositional pattern correctly and naturally in their own sentence.',
      'The pattern is a fixed collocation whose preposition has no derivable logic and must be memorized.',
      'Judge two things: (1) did they include the pattern with the CORRECT preposition, and (2) does the sentence read naturally.',
      'feedback: say what worked and, if wrong, name the correct preposition and why the sentence needs it. Chinese may be used when it clarifies.',
      'modelSentence: one natural example sentence that uses the pattern correctly.',
      'Return ONLY JSON matching: {correct,feedback,modelSentence}.',
    ].join(' '),
    user: [
      `Pattern: ${ctx.phrase}`,
      `Required preposition: ${ctx.preposition}`,
      `Learner's sentence: ${ctx.sentence}`,
    ].join('\n'),
  };
}

export async function checkPatternUsage(
  provider: LLMProvider,
  ctx: PatternUsageContext & { model: string },
): Promise<PatternUsageCheckResponse> {
  const { system, user } = assemblePatternUsagePrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return patternUsageCheckZ.parse(JSON.parse(raw));
}

const PREPOSITION_SET = new Set(PREPOSITIONS.map(p => p.toLowerCase()));

export function assemblePatternExtractionPrompt(words: string[]): { system: string; user: string } {
  return {
    system: [
      'You find fixed prepositional collocations that an English learner must memorize because the preposition has no derivable logic.',
      'Given a list of words/phrases, return ONLY the ones that have ONE dominant, fixed preposition a learner should drill (e.g. register -> "register for", depend -> "depend on", keen -> "keen on", capable -> "capable of").',
      'Skip words with no fixed preposition, and skip words where several prepositions are equally common and change the meaning (e.g. "look" -> look at/for/after) unless one is clearly the core pattern.',
      'For each, phrase is the natural fixed combination and preposition is the single gap word (must be exactly the preposition that appears in phrase).',
      'Return ONLY JSON matching: {patterns:[{phrase,preposition}]}. Return {patterns:[]} if none qualify.',
    ].join(' '),
    user: [
      'Words/phrases:',
      words.map((word, index) => `${index + 1}. ${word}`).join('\n'),
    ].join('\n'),
  };
}

// Keep only well-formed combos: a known preposition that actually appears in the phrase.
export function sanitizeCombos(combos: ExtractedCombo[]): ExtractedCombo[] {
  const seen = new Set<string>();
  const clean: ExtractedCombo[] = [];
  for (const combo of combos) {
    const phrase = combo.phrase.trim();
    const preposition = combo.preposition.trim().toLowerCase();
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    if (!PREPOSITION_SET.has(preposition)) continue;
    if (!new RegExp(`\\b${preposition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(phrase)) continue;
    if (phrase.split(/\s+/).length < 2 || phrase.split(/\s+/).length > 6) continue;
    seen.add(key);
    clean.push({ phrase, preposition });
  }
  return clean;
}

export async function extractFixedCombos(
  provider: LLMProvider,
  ctx: { words: string[]; model: string },
): Promise<ExtractedCombo[]> {
  if (!ctx.words.length) return [];
  const { system, user } = assemblePatternExtractionPrompt(ctx.words);
  const raw = await provider.complete({ system, user, model: ctx.model });
  const parsed = patternExtractionZ.parse(JSON.parse(raw));
  return sanitizeCombos(parsed.patterns);
}
