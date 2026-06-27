import { expect, it } from 'vitest';
import { deepDiveWord, enrichWord } from '../src/brain/enrich.js';
import type { LLMProvider } from '../src/brain/provider.js';

it('normalizes common model kind labels into the vocab schema', async () => {
  const provider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        word: 'shore up',
        kind: 'phrasal verb',
        defCn: 'support or strengthen',
      });
    },
  };

  const vocab = await enrichWord(provider, { word: 'shore up', model: 'test' });

  expect(vocab.kind).toBe('phrase');
});

it('parses a word deep dive from the utility provider', async () => {
  const provider: LLMProvider = {
    async complete(opts) {
      expect(opts.model).toBe('utility-test');
      expect(opts.user).toBe('Word: allocate');
      return JSON.stringify({
        wordFamily: ['allocate', 'allocated', 'allocation'],
        nearSynonyms: [
          { word: 'assign', distinction: 'Use assign for giving a task or owner in operational writing.' },
        ],
        usageExamples: [
          'The finance team allocated more capital to cloud infrastructure.',
          'A poor allocation can weaken the product runway.',
          'The budget was allocated before the roadmap changed.',
        ],
      });
    },
  };

  await expect(deepDiveWord(provider, 'allocate', 'utility-test')).resolves.toEqual({
    wordFamily: ['allocate', 'allocated', 'allocation'],
    nearSynonyms: [
      { word: 'assign', distinction: 'Use assign for giving a task or owner in operational writing.' },
    ],
    usageExamples: [
      'The finance team allocated more capital to cloud infrastructure.',
      'A poor allocation can weaken the product runway.',
      'The budget was allocated before the roadmap changed.',
    ],
    usageExamplesRich: [
      { sentence: 'The finance team allocated more capital to cloud infrastructure.' },
      { sentence: 'A poor allocation can weaken the product runway.' },
      { sentence: 'The budget was allocated before the roadmap changed.' },
    ],
  });
});

it('derives plain usage examples from rich deep-dive examples', async () => {
  const provider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        wordFamily: ['run', 'running'],
        usageExamplesRich: [
          { sentence: 'The team is running a tighter forecast review.', role: 'verb in progress' },
        ],
      });
    },
  };

  await expect(deepDiveWord(provider, 'run', 'utility-test')).resolves.toEqual({
    wordFamily: ['run', 'running'],
    usageExamples: ['The team is running a tighter forecast review.'],
    usageExamplesRich: [
      { sentence: 'The team is running a tighter forecast review.', role: 'verb in progress' },
    ],
  });
});
