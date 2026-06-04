import { expect, it } from 'vitest';
import { enrichWord } from '../src/brain/enrich.js';
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
