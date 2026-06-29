import { describe, it, expect } from 'vitest';
import { assembleCoachPrompt, assembleSentenceLabPrompt } from '../src/brain/prompts.js';

const coachSystem = assembleCoachPrompt({
  paragraph: 'The logistics of the project needs careful planning.',
  paragraphIndex: 0,
  topErrors: ['article_misuse', 'small_grammar'],
  vocabCandidates: [],
}).system;

const sentenceLabSystem = assembleSentenceLabPrompt({
  sentence: 'She not only has the potential to replace not only humans but also machines.',
  topErrors: ['word_order'],
}).system;

describe('assembleCoachPrompt explanation quality', () => {
  it('requires THREE components in every explanation', () => {
    expect(coachSystem).toContain('THREE components');
  });

  it('requires a Rule component naming the grammar rule', () => {
    expect(coachSystem).toContain('Rule: state the specific grammar rule name');
  });

  it('requires a Why component with linguistic reasoning', () => {
    expect(coachSystem).toContain('Why: explain the linguistic reason');
  });

  it('requires a Chinese-L1 mindset component', () => {
    expect(coachSystem).toContain('Chinese-L1 mindset');
  });

  it('requires word-order issues to explain WHY the order matters', () => {
    expect(coachSystem).toContain('word-order issues');
    expect(coachSystem).toContain('WHY the specific order matters');
    expect(coachSystem).toContain('Never just say "this is more natural."');
  });

  it('requires countable/uncountable errors to state noun status with a self-test', () => {
    expect(coachSystem).toContain('countable or uncountable IN THIS CONTEXT');
    expect(coachSystem).toContain('one-sentence test the writer can apply');
  });
});

describe('assembleSentenceLabPrompt explanation quality', () => {
  it('requires THREE components in every explanation', () => {
    expect(sentenceLabSystem).toContain('THREE components');
  });

  it('requires a Chinese-L1 mindset component', () => {
    expect(sentenceLabSystem).toContain('Chinese-L1 mindset');
  });

  it('requires word-order issues to explain WHY the order matters', () => {
    expect(sentenceLabSystem).toContain('word-order issues');
    expect(sentenceLabSystem).toContain('WHY the specific order matters');
    expect(sentenceLabSystem).toContain('Never just say "this is more natural."');
  });

  it('requires countable/uncountable errors to state noun status with a self-test', () => {
    expect(sentenceLabSystem).toContain('countable or uncountable IN THIS CONTEXT');
    expect(sentenceLabSystem).toContain('one-sentence test the writer can apply');
  });
});
