import { describe, it, expect } from 'vitest';
import { coachParagraph } from '../src/brain/coach.js';
import type { LLMProvider } from '../src/brain/provider.js';
import { speakingReviewResponseZ } from '../src/brain/schema.js';

const mock: LLMProvider = {
  async complete() {
    return JSON.stringify({
      paragraphIndex: 0,
      annotations: [
        {
          span: 'implementation of the policy',
          errorType: 'noun_plague',
          hint: 'Turn the heavy noun phrase into a verb.',
          explanation: 'Noun plague: nominalization weakens the sentence.',
          rule: 'Prefer a verb over a noun string',
          ruleExample: {
            before: 'carried out the implementation of the policy',
            after: 'implemented the policy',
          },
          modelRewrite: 'implemented the policy',
        },
      ],
      nativeVersion: 'We implemented the policy.',
    });
  },
};

it('validates and returns a CoachResponse using the current ERROR_TYPES contract', async () => {
  const res = await coachParagraph(mock, {
    paragraph: 'We carried out the implementation of the policy.',
    paragraphIndex: 0,
    topErrors: ['noun_plague'],
    vocabCandidates: [],
    model: 'test',
  });

  expect(res.annotations[0].errorType).toBe('noun_plague');
  expect(res.annotations[0].rule).toBe('Prefer a verb over a noun string');
  expect(res.annotations[0].ruleExample).toEqual({
    before: 'carried out the implementation of the policy',
    after: 'implemented the policy',
  });
  expect(res.annotations[0].modelRewrite).toBe('implemented the policy');
  expect(res.annotations[0].hint).not.toBe(res.annotations[0].modelRewrite);
  expect(res.nativeVersion).toBe('We implemented the policy.');
});

it('throws on malformed JSON', async () => {
  const bad: LLMProvider = { async complete() { return 'not json'; } };

  await expect(coachParagraph(bad, {
    paragraph: 'x',
    paragraphIndex: 0,
    topErrors: [],
    vocabCandidates: [],
    model: 'test',
  })).rejects.toThrow();
});

it('validates speaking review responses with takeaways', () => {
  const parsed = speakingReviewResponseZ.parse({
    nativeVersion: 'I think the article makes a fair point, but it overlooks execution risk.',
    takeaways: [
      'Use "makes a fair point" instead of "has a reasonable opinion" in this context.',
      'Use "overlooks" for a missed factor.',
    ],
    annotations: [{
      span: 'has a reasonable opinion',
      errorType: 'word_choice',
      hint: 'Use a more natural phrase for agreeing with an argument.',
      explanation: 'Native speakers usually say an article "makes a fair point" rather than "has an opinion."',
      rule: 'Article as argument, not person',
      ruleExample: {
        before: 'the article has a reasonable opinion',
        after: 'the article makes a fair point',
      },
      modelRewrite: 'makes a fair point',
    }],
  });

  expect(parsed.takeaways).toHaveLength(2);
  expect(parsed.annotations[0].errorType).toBe('word_choice');
});

it('defaults omitted speaking review arrays to empty arrays', () => {
  const parsed = speakingReviewResponseZ.parse({
    nativeVersion: 'That sounds natural in this context.',
  });

  expect(parsed.takeaways).toEqual([]);
  expect(parsed.annotations).toEqual([]);
});
