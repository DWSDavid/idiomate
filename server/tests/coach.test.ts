import { describe, it, expect } from 'vitest';
import { coachParagraph } from '../src/brain/coach.js';
import type { LLMProvider } from '../src/brain/provider.js';

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
          modelRewrite: 'implemented the policy',
        },
      ],
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
  expect(res.annotations[0].modelRewrite).toBe('implemented the policy');
  expect(res.annotations[0].hint).not.toBe(res.annotations[0].modelRewrite);
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
