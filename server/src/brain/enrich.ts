import type { Vocab, VocabKind } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { enrichedVocabZ, wordDeepDiveZ, type WordDeepDive } from './schema.js';

interface EnrichWordContext {
  word: string;
  contextSentence?: string;
  model: string;
}

interface TranslateChineseVocabContext {
  text: string;
  contextSentence?: string;
  model: string;
}

function inferKind(word: string): VocabKind {
  return word.trim().includes(' ') ? 'phrase' : 'word';
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeKind(kind: unknown, word: string): VocabKind {
  if (typeof kind !== 'string') return inferKind(word);
  const value = kind.toLowerCase().trim();
  if (value.includes('collocation')) return 'collocation';
  if (value === 'phrase' || value.includes('phrasal') || value.includes('idiom')) return 'phrase';
  if (value === 'word') return 'word';
  return inferKind(word);
}

export async function enrichWord(provider: LLMProvider, ctx: EnrichWordContext): Promise<Vocab> {
  const raw = await provider.complete({
    model: ctx.model,
    system: [
      'You enrich a user-captured English vocabulary item for a local writing companion.',
      'Return ONLY JSON. Every field is a string (or array of strings) when present; never use booleans.',
      'Shape: {word, normalized, baseForm, kind, ipa, defCn, pos, contextSentence, examples, collocations, register}.',
      'normalized is the lowercase string form of word.',
      'baseForm is the canonical lemma used for deduplication: fortune for fortunes, run for running, and the normalized phrase for fixed phrases.',
      'Omit any field you cannot fill rather than guessing a type.',
      'Keep examples short and useful for professional English writing.',
    ].join(' '),
    user: [
      `Word or phrase: ${ctx.word}`,
      `Context sentence: ${ctx.contextSentence ?? 'none'}`,
    ].join('\n'),
  });

  const json = JSON.parse(raw) as Record<string, unknown>;
  json.kind = normalizeKind(json.kind, ctx.word);
  const parsed = enrichedVocabZ.parse(json);
  const word = parsed.word.trim().replace(/\s+/g, ' ');
  const normalized = parsed.normalized ? normalizeText(parsed.normalized) : normalizeText(word);
  return {
    ...parsed,
    word,
    normalized,
    baseForm: parsed.baseForm ? normalizeText(parsed.baseForm) : normalized,
    kind: parsed.kind ?? inferKind(word),
    source: 'capture',
    contextSentence: parsed.contextSentence ?? ctx.contextSentence,
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
  };
}

export async function translateChineseVocab(
  provider: LLMProvider,
  ctx: TranslateChineseVocabContext,
): Promise<Vocab> {
  const raw = await provider.complete({
    model: ctx.model,
    system: [
      'You convert a Chinese expression into one natural English vocabulary item for a local writing companion.',
      'Choose a word, phrase, or collocation that the learner can reuse in finance, tech, or professional English writing.',
      'Return ONLY JSON. Every field is a string (or array of strings) when present; never use booleans.',
      'Shape: {word, normalized, baseForm, kind, ipa, defCn, pos, contextSentence, examples, collocations, register}.',
      'normalized is the lowercase string form of word.',
      'baseForm is the canonical lemma used for deduplication: fortune for fortunes, run for running, and the normalized phrase for fixed phrases.',
      'Omit any field you cannot fill rather than guessing a type.',
      'defCn should preserve the Chinese meaning; examples should be short and useful.',
    ].join(' '),
    user: [
      `Chinese expression: ${ctx.text}`,
      `Context or intended use: ${ctx.contextSentence ?? 'none'}`,
    ].join('\n'),
  });

  const json = JSON.parse(raw) as Record<string, unknown>;
  const suggestedWord = typeof json.word === 'string' ? json.word : ctx.text;
  json.kind = normalizeKind(json.kind, suggestedWord);
  const parsed = enrichedVocabZ.parse(json);
  const word = parsed.word.trim().replace(/\s+/g, ' ');
  const normalized = parsed.normalized ? normalizeText(parsed.normalized) : normalizeText(word);
  return {
    ...parsed,
    word,
    normalized,
    baseForm: parsed.baseForm ? normalizeText(parsed.baseForm) : normalized,
    kind: parsed.kind ?? inferKind(word),
    source: 'chinese_input',
    contextSentence: parsed.contextSentence ?? ctx.contextSentence,
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
  };
}

export async function deepDiveWord(provider: LLMProvider, word: string, model: string): Promise<WordDeepDive> {
  const raw = await provider.complete({
    model,
    system: [
      'You are a vocabulary analyst for a professional English writing assistant.',
      'Return ONLY JSON. Every field is a string or array of strings; never use booleans.',
      'Shape: { wordFamily, nearSynonyms, usageExamples }.',
      'wordFamily: all common inflected and derived forms including the base form. Max 12 items.',
      'nearSynonyms: up to 4 near-synonyms each with a one-sentence "distinction" explaining when to prefer one over the other in professional writing - be specific about register, formality, and domain.',
      'usageExamples: exactly 3 short sentences in finance, tech, or professional writing contexts. Each must use the word or one of its family forms naturally.',
    ].join(' '),
    user: `Word: ${word}`,
  });
  return wordDeepDiveZ.parse(JSON.parse(raw));
}
