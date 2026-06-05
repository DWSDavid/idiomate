import type { ErrorType } from '../../../shared/types.js';

/**
 * Named, teachable grammar / Chinglish principles for Idiomate's coach.
 *
 * Purpose: give the coach a vocabulary of *named rules* so its explanations are
 * specific ("Let's + base verb", "indirect question keeps statement word order")
 * instead of vague. Each rule carries a one-line principle and ONE original
 * before/after illustration.
 *
 * All examples are original, written for this project. They illustrate common
 * Chinese-L1 patterns; none are reproduced from any source text.
 */

export interface GrammarRule {
  id: string;
  name: string;                       // short nameable handle, shown to the user
  principle: string;                  // the "why", one line
  mindset?: string;                   // reviewer-authored Chinglish thinking note
  example: { before: string; after: string };
  relates: ErrorType[];               // taxonomy categories this rule serves
}

// REVIEWER MINDSET SEAM:
// Claude can replace these original mindset notes without changing the lesson API.
const CHINGLISH_MINDSET = {
  calque: '不要先找中文短语的一一对应。先问英语里这个场景通常怎么搭配。',
  nounPlague: '中文里常先搭一个抽象名词框架, 英文更常直接让动词承担动作。先问 who does what。',
  redundancy: '中文里重复和铺垫有时显得完整, 英文读者更期待每个词增加新信息。',
  overExplanation: '中文论述常用背景和限定来显得周全, 英文更看重主张是否直接。',
} as const;

export const GRAMMAR_RULES: GrammarRule[] = [
  {
    id: 'lets-base-verb',
    name: "Let's + base verb",
    principle: "After \"Let's\" use the base form of the verb, never the past or -ing form.",
    example: { before: "Let's started with an example.", after: "Let's start with an example." },
    relates: ['small_grammar'],
  },
  {
    id: 'indirect-question-order',
    name: 'Indirect question keeps statement order',
    principle: 'Embedded/indirect questions use statement word order — no subject-auxiliary inversion and no do-support.',
    example: { before: 'on how did you define the problem', after: 'on how you define the problem' },
    relates: ['word_order'],
  },
  {
    id: 'have-past-participle',
    name: 'have/has + past participle',
    principle: 'The perfect tense needs the past participle after have/has, not the bare past form.',
    example: { before: 'report what they done', after: 'report what they have done' },
    relates: ['small_grammar'],
  },
  {
    id: 'conditional-tense-consistency',
    name: 'Conditional tense consistency',
    principle: 'In a real conditional, the if-clause stays present when the result is present/future; do not mix in a past form.',
    example: { before: 'if we tolerate this happened', after: 'if we tolerate this happening' },
    relates: ['tense'],
  },
  {
    id: 'gerund-after-verb',
    name: 'Gerund after certain verbs',
    principle: 'Some verbs (tolerate, avoid, consider, suggest, risk, keep) take an -ing complement, not a past form or "to".',
    example: { before: 'tolerate this happened', after: 'tolerate this happening' },
    relates: ['small_grammar', 'word_choice'],
  },
  {
    id: 'do-support-base',
    name: 'do/does/did + base verb',
    principle: 'After do/does/did, the main verb stays in its base form.',
    example: { before: 'how did you defined it', after: 'how did you define it' },
    relates: ['small_grammar'],
  },
  {
    id: 'adjective-not-noun',
    name: 'Adjective is not a noun',
    principle: 'Do not use an adjective where a noun is required; pick the noun form or restructure.',
    example: { before: 'make it become a strategic', after: 'turn it into a strategic risk' },
    relates: ['word_choice'],
  },
  {
    id: 'start-with-or-by',
    name: 'start with / start by doing',
    principle: 'Use "start with + noun" or "start by + -ing"; not "start by a noun".',
    mindset: CHINGLISH_MINDSET.calque,
    example: { before: 'start by a common problem', after: 'start with a common problem' },
    relates: ['calque', 'word_choice'],
  },
  {
    id: 'preposition-collocation',
    name: 'Fixed preposition collocations',
    principle: 'Many words pair with a fixed preposition (support FOR, depend ON, consist OF, result IN).',
    example: { before: 'our support to our peer', after: 'our support for our peer' },
    relates: ['word_choice', 'small_grammar'],
  },
  {
    id: 'article-count-noun',
    name: 'Singular count noun needs an article',
    principle: 'A singular countable noun needs a/an/the (or a possessive) before it.',
    example: { before: 'She is teacher.', after: 'She is a teacher.' },
    relates: ['small_grammar'],
  },
  {
    id: 'nominalization-to-verb',
    name: 'Prefer a verb over a noun string',
    principle: 'Replace an abstract noun phrase propped up by an empty verb with a single strong verb.',
    mindset: CHINGLISH_MINDSET.nounPlague,
    example: { before: 'carried out the implementation of the policy', after: 'implemented the policy' },
    relates: ['noun_plague'],
  },
  {
    id: 'category-noun-drop',
    name: 'Drop empty category nouns',
    principle: 'Cut filler category nouns ("a state of", "the work of", "the problem of") that add no meaning.',
    mindset: CHINGLISH_MINDSET.redundancy,
    example: { before: 'in a state of rapid growth', after: 'growing rapidly' },
    relates: ['redundancy'],
  },
  {
    id: 'redundant-twins',
    name: 'Avoid redundant twins',
    principle: 'Two near-synonyms joined by "and" usually say one thing; keep the stronger word.',
    mindset: CHINGLISH_MINDSET.redundancy,
    example: { before: 'help and assistance', after: 'help' },
    relates: ['redundancy'],
  },
  {
    id: 'state-core-claim-once',
    name: 'State the core claim once',
    principle: 'Say the main point once, then add only the qualification that changes the meaning.',
    mindset: CHINGLISH_MINDSET.overExplanation,
    example: { before: 'In my personal opinion, I think that we should wait.', after: 'We should wait.' },
    relates: ['over_explanation'],
  },
  {
    id: 'one-idea-per-sentence',
    name: 'One main idea per sentence',
    principle: 'Split a sentence that stacks several ideas; English prefers linear, finish-one-then-next flow.',
    example: {
      before: 'Someone used techniques, cheated on the exam, and excitedly shared this, which surprised us.',
      after: 'Someone used hidden techniques to cheat on the exam. He then shared it with us, which surprised everyone.',
    },
    relates: ['sprawl'],
  },
  {
    id: 'parallel-structure',
    name: 'Parallel structure in a series',
    principle: 'Items joined in a list must share the same grammatical form.',
    example: { before: 'reading, to write, and discussion', after: 'reading, writing, and discussing' },
    relates: ['cohesion'],
  },
  {
    id: 'precise-connectives',
    name: 'Precise logical connectives',
    principle: 'Mark the logical relationship explicitly (however, therefore, although) instead of stringing clauses with "and/so".',
    example: { before: 'The team worked hard and sales fell.', after: 'Although the team worked hard, sales still fell.' },
    relates: ['cohesion'],
  },
  {
    id: 'tense-narrative-consistency',
    name: 'Keep one time frame',
    principle: 'Hold a single tense across a narrative unless the time actually changes.',
    example: { before: 'Yesterday I go to the meeting and discussed the plan.', after: 'Yesterday I went to the meeting and discussed the plan.' },
    relates: ['tense'],
  },
  {
    id: 'modal-hedge',
    name: 'could/would for tentative claims',
    principle: 'Use could/would (not will/can) when the outcome is proposed or uncertain, to match register.',
    example: { before: 'This will solve the problem.', after: 'This could solve the problem.' },
    relates: ['modality'],
  },
];

const RULES_BY_TYPE = GRAMMAR_RULES.reduce<Record<string, GrammarRule[]>>((acc, rule) => {
  for (const t of rule.relates) (acc[t] ??= []).push(rule);
  return acc;
}, {});

/** Rules relevant to a set of error types (for focused prompt injection). */
export function rulesForTypes(types: ErrorType[]): GrammarRule[] {
  const seen = new Set<string>();
  const out: GrammarRule[] = [];
  for (const t of types) {
    for (const r of RULES_BY_TYPE[t] ?? []) {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
    }
  }
  return out;
}

/** Compact, model-readable rendering of the full rule set for prompt injection. */
export function rulesSnippet(rules: GrammarRule[] = GRAMMAR_RULES): string {
  return rules
    .map(r => `- ${r.name}: ${r.principle} e.g. "${r.example.before}" → "${r.example.after}"`)
    .join('\n');
}
