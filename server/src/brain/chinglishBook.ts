import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BookReference, ErrorType } from '../../../shared/types.js';

const SOURCE = "The Translator's Guide to Chinglish";
const here = dirname(fileURLToPath(import.meta.url));
const defaultBookPath = join(here, '../../../refs/chinglish-pinkham.txt');

interface ReferencePattern {
  label: string;
  searchTerms: string[];
}

const PATTERNS: Record<ErrorType, ReferencePattern> = {
  redundancy: {
    label: 'Unnecessary Words: concise English removes words that add no meaning',
    searchTerms: [
      'unnecessary words are the hallmark',
      'a sentence should contain no unnecessary words',
      'you will find words that could and should have been omitted',
    ],
  },
  noun_plague: {
    label: 'Noun Plague: unnecessary verb plus noun',
    searchTerms: [
      'real action is expressed in the noun',
      'the basic pattern is unnec. verb + noun',
      'VII. The Noun Plague',
    ],
  },
  calque: {
    label: 'Direct Translation: expressions carried over from Chinese',
    searchTerms: [
      'carried over from the Chinese original',
      'straight out of the Chinese',
      'translated literally into English',
    ],
  },
  over_explanation: {
    label: 'Unnecessary Words: over-explaining what the sentence already says',
    searchTerms: [
      'does not need to be carried over in translation',
      'their function is served by the tense of the verb',
      'too much emphasis means',
    ],
  },
  tense: {
    label: 'Unnecessary Time Markers: tense can already carry the time signal',
    searchTerms: [
      'the future tense of the verb',
      'their function is served by the tense of the verb',
      'redundant with the verb tense',
    ],
  },
  modality: {
    label: 'Modality and Register: project grammar rule, no direct book quote mapped',
    searchTerms: [],
  },
  word_order: {
    label: 'Sentence Structure: word order should make relations clear',
    searchTerms: [
      'simplest, most natural word order in English',
      'unnatural word order',
      'English order, making the relations',
    ],
  },
  sprawl: {
    label: 'Sentence Structure: make the English sentence clear and logical',
    searchTerms: [
      'the need to make an English sentence clear and logical',
      'go over every sentence twice in order to make sense',
      'logical progression of ideas',
    ],
  },
  small_grammar: {
    label: 'Small Grammar: project grammar rule, no direct book quote mapped',
    searchTerms: [],
  },
  word_choice: {
    label: 'Word Choice: choose a strong precise word',
    searchTerms: [
      'a strong, precise word',
      'most natural word order in English',
      'rich vocabulary the language has to offer',
    ],
  },
  cohesion: {
    label: 'Logical Connectives: show the relation between ideas',
    searchTerms: [
      'the logical relation between the two parts of the sentence',
      'provide the logical connection',
      'Logical Connectives',
    ],
  },
  vocab_suggestion: {
    label: 'Vocabulary Activation: not a Chinglish error',
    searchTerms: [],
  },
};

let cachedText: string | undefined;

function localBookText(): string {
  if (cachedText !== undefined) return cachedText;
  cachedText = existsSync(defaultBookPath) ? readFileSync(defaultBookPath, 'utf8') : '';
  return cachedText;
}

function normalizeText(text: string): string {
  return text
    .replace(/\f/g, ' ')
    .replace(/-\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortQuoteAround(text: string, term: string): string | undefined {
  const normalized = normalizeText(text);
  const index = normalized.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return undefined;

  const before = normalized.slice(0, index).split(/\s+/).filter(Boolean).slice(-5);
  const after = normalized.slice(index).split(/\s+/).filter(Boolean).slice(0, 19);
  const quote = [...before, ...after].join(' ').replace(/\s+([,.;:!?])/g, '$1');
  return quote.split(/\s+/).slice(0, 24).join(' ');
}

function findQuote(text: string, terms: string[]): string | undefined {
  for (const term of terms) {
    const quote = shortQuoteAround(text, term);
    if (quote) return quote;
  }
  return undefined;
}

export function findChinglishBookReference(
  errorType: ErrorType,
  ruleName?: string,
  bookText = localBookText(),
): BookReference {
  const pattern = PATTERNS[errorType];
  const quote = pattern.searchTerms.length ? findQuote(bookText, pattern.searchTerms) : undefined;

  return {
    source: SOURCE,
    pattern: ruleName ? `${pattern.label} | ${ruleName}` : pattern.label,
    ...(quote
      ? { quote }
      : { quoteStatus: 'No exact local book quote found for this pattern yet.' }),
  };
}

export function attachBookReferences<T extends { errorType: ErrorType; rule?: string }>(items: T[]): Array<T & {
  bookReference: BookReference;
}> {
  return items.map(item => ({
    ...item,
    bookReference: findChinglishBookReference(item.errorType, item.rule),
  }));
}
