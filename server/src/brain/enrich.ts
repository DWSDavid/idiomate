import type { Vocab, VocabKind } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { enrichedVocabZ } from './schema.js';

interface EnrichWordContext {
  word: string;
  contextSentence?: string;
  model: string;
}

function inferKind(word: string): VocabKind {
  return word.trim().includes(' ') ? 'phrase' : 'word';
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
      'Return ONLY JSON matching: {word,normalized?,kind?,ipa?,defCn?,pos?,contextSentence?,examples?,collocations?,register?}.',
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
  return {
    ...parsed,
    word,
    normalized: parsed.normalized?.trim().replace(/\s+/g, ' ').toLowerCase() ?? word.toLowerCase(),
    kind: parsed.kind ?? inferKind(word),
    source: 'capture',
    contextSentence: parsed.contextSentence ?? ctx.contextSentence,
    captureCount: 1,
    timesSuggested: 0,
    timesUsed: 0,
  };
}
