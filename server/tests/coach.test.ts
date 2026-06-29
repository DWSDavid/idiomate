import { describe, it, expect } from 'vitest';
import { coachParagraph } from '../src/brain/coach.js';
import { reviewSpeakingTranscript } from '../src/brain/speaking.js';
import { assembleSpeakingReviewPrompt } from '../src/brain/prompts.js';
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

it('assembles a speaking-specific prompt that avoids essay polishing and audio scoring', () => {
  const prompt = assembleSpeakingReviewPrompt({
    transcript: 'I think this article has a useful perspective about AI agents.',
    context: 'Spoken reaction after reading an article',
    contextTitle: 'AI agents move into finance workflows',
    contextUrl: 'https://example.com/ai-agents',
    contextExcerpt: 'Agents are entering finance workflows faster than expected.',
    topErrors: ['word_choice'],
    memoryContext: {
      topWeaknesses: ['word_choice'],
      relevantSnippets: ['Past writing context about precise verbs.'],
    },
  });

  expect(prompt.system).toContain('spoken-expression coach');
  expect(prompt.system).toContain('Do not judge pronunciation');
  expect(prompt.system).toContain('Do not turn the transcript into formal essay prose');
  expect(prompt.user).toContain('Spoken transcript:');
  expect(prompt.user).toContain('AI agents move into finance workflows');
  expect(prompt.user).toContain('https://example.com/ai-agents');
  expect(prompt.user).toContain('Persistent weaknesses to watch: word_choice.');
});

it('reviews speaking transcripts through the provider and validates the response', async () => {
  const provider: LLMProvider = {
    async complete(opts) {
      expect(opts.system).toContain('spoken-expression coach');
      expect(opts.user).toContain('I think this article has a useful perspective');
      return JSON.stringify({
        nativeVersion: 'I think this article offers a useful perspective on AI agents.',
        takeaways: ['Use "offers a perspective" for what an article does.'],
        annotations: [{
          span: 'has a useful perspective',
          errorType: 'word_choice',
          hint: 'Use a more natural verb for what an article does.',
          explanation: 'Articles usually "offer" a perspective.',
          rule: 'Article as argument, not person',
          ruleExample: {
            before: 'the article has a useful perspective',
            after: 'the article offers a useful perspective',
          },
          modelRewrite: 'offers a useful perspective',
        }],
      });
    },
  };

  const result = await reviewSpeakingTranscript(provider, {
    transcript: 'I think this article has a useful perspective about AI agents.',
    topErrors: ['word_choice'],
    model: 'test-model',
  });

  expect(result.nativeVersion).toBe('I think this article offers a useful perspective on AI agents.');
  expect(result.takeaways).toEqual(['Use "offers a perspective" for what an article does.']);
  expect(result.annotations[0].modelRewrite).toBe('offers a useful perspective');
});
