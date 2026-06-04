import type { ErrorType } from '../../../shared/types.js';

/**
 * Error taxonomy v0 for Idiomate's coaching brain.
 *
 * Categories are informed by the *Chinese→English transfer* patterns documented
 * in "The Translator's Guide to Chinglish" (中式英语之鉴). All before/after
 * examples below are ORIGINAL, written for this project — they illustrate the
 * pattern, not the book's text.
 *
 * Each entry powers (a) the `errorType` the coach must name, (b) the one-line
 * `whatItIs` used in hints/explanations, and (c) seed `examples` injected into
 * the coaching prompt so the model stays consistent.
 */

export interface TaxonomyExample {
  before: string;
  after: string;
  note?: string;
}

export interface TaxonomyEntry {
  name: string;        // short display name
  whatItIs: string;    // one-line definition
  examples: TaxonomyExample[];
}

export const ERROR_TAXONOMY: Record<ErrorType, TaxonomyEntry> = {
  redundancy: {
    name: 'Redundancy / wordiness',
    whatItIs:
      'Unnecessary words that add no meaning — category nouns ("the work of…"), empty verbs ("make an improvement to"), or stacked synonyms.',
    examples: [
      { before: 'We must make an improvement to the plan.', after: 'We must improve the plan.' },
      { before: 'The economy is in a state of rapid growth.', after: 'The economy is growing rapidly.', note: 'drop the category noun "state of"' },
      { before: 'These are completely new innovations.', after: 'These are innovations.', note: '"new" is built into "innovation"' },
    ],
  },
  calque: {
    name: 'Direct translation / calque',
    whatItIs:
      'A phrase translated word-for-word from Chinese, producing an unnatural English collocation or idiom.',
    examples: [
      { before: 'Please open the light.', after: 'Please turn on the light.' },
      { before: 'He gave me a big help.', after: 'He helped me a lot.' },
      { before: 'I very like this approach.', after: 'I really like this approach.' },
    ],
  },
  over_explanation: {
    name: 'Over-explanation / over-qualification',
    whatItIs:
      'Spelling out what is already implied, or hedging the same point twice, instead of stating it once.',
    examples: [
      { before: 'In my personal opinion, I think that we should wait.', after: 'We should wait.' },
      { before: 'The reason why it failed is because the budget was cut.', after: 'It failed because the budget was cut.' },
    ],
  },
  tense: {
    name: 'Tense consistency',
    whatItIs:
      'Tenses that shift without reason within a passage, or a verb form that does not match the time frame.',
    examples: [
      { before: 'Yesterday I go to the meeting and discussed the budget.', after: 'Yesterday I went to the meeting and discussed the budget.' },
      { before: 'The report shows revenue rose last year and then it will fall.', after: 'The report shows revenue rose last year and then fell.' },
    ],
  },
  modality: {
    name: 'Modality & register',
    whatItIs:
      'Over-direct "can/will" where a softer "could/would" fits the register, or hedging that is too strong or too weak for the claim.',
    examples: [
      { before: 'I will be glad if you can send the file.', after: 'I would be glad if you could send the file.' },
      { before: 'This will solve the problem.', after: 'This could solve the problem.', note: 'when the outcome is not certain' },
    ],
  },
  word_order: {
    name: 'Word order',
    whatItIs:
      'Misplaced adverbs/adjectives or marked information structure transferred from Chinese.',
    examples: [
      { before: 'She speaks fluently English.', after: 'She speaks English fluently.' },
      { before: 'I know already the answer.', after: 'I already know the answer.' },
    ],
  },
  sprawl: {
    name: 'Sentence sprawl / non-linear',
    whatItIs:
      'One sentence carrying too many ideas, or topic jumps that should be split into linear, single-point sentences.',
    examples: [
      {
        before: 'Because the market was volatile and our costs rose and also we had fewer customers so we lost money which was bad.',
        after: 'The market was volatile and our costs rose. With fewer customers, we lost money.',
      },
    ],
  },
  small_grammar: {
    name: 'Small grammar',
    whatItIs:
      'Articles, prepositions, and singular/plural — the high-frequency low-level errors.',
    examples: [
      { before: 'She is teacher.', after: 'She is a teacher.' },
      { before: 'We discussed about the plan.', after: 'We discussed the plan.' },
      { before: 'I need more informations.', after: 'I need more information.' },
    ],
  },
  word_choice: {
    name: 'Word choice / collocation',
    whatItIs:
      'A word whose meaning is close but whose collocation or register is wrong for the context.',
    examples: [
      { before: 'Heavy rain made a big influence on sales.', after: 'Heavy rain had a big impact on sales.' },
      { before: 'We need to enhance our problems.', after: 'We need to address our problems.' },
    ],
  },
  cohesion: {
    name: 'Cohesion',
    whatItIs:
      'Missing or misused logical connectors, or given-new ordering that makes sentences feel disconnected.',
    examples: [
      {
        before: 'Sales fell. The team worked hard. Costs rose.',
        after: 'Although the team worked hard, sales fell as costs rose.',
      },
    ],
  },
  vocab_suggestion: {
    name: 'Vocab opportunity (not an error)',
    whatItIs:
      "Not a mistake — a spot where a word from the user's own accumulated list would fit naturally. Suggest, never replace; the user chooses.",
    examples: [
      { before: 'Firms use data to cut costs.', after: 'Firms leverage data to cut costs.', note: "only if 'leverage' is in the user's list" },
    ],
  },
};

/**
 * Render a compact snippet of the relevant taxonomy entries for prompt injection.
 * Keeps the coaching prompt small by including only the error types in play.
 */
export function taxonomySnippet(types: ErrorType[]): string {
  const seen = new Set<ErrorType>();
  const lines: string[] = [];
  for (const t of types) {
    if (seen.has(t)) continue;
    seen.add(t);
    const e = ERROR_TAXONOMY[t];
    if (!e) continue;
    const ex = e.examples[0];
    lines.push(`- [${t}] ${e.name}: ${e.whatItIs}` + (ex ? ` e.g. "${ex.before}" → "${ex.after}"` : ''));
  }
  return lines.join('\n');
}

/** All error type keys, handy for "include the full taxonomy" calls. */
export const ALL_ERROR_TYPES = Object.keys(ERROR_TAXONOMY) as ErrorType[];
