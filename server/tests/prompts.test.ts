import { describe, it, expect } from 'vitest';
import {
  assembleCoachPrompt,
  assembleDailyPrompt,
  assemblePrimePrompt,
  generateDailyPrompt,
  selectPrimeWords,
} from '../src/brain/prompts.js';
import { ERROR_TYPES } from '../../shared/types.js';
import type { LLMProvider } from '../src/brain/provider.js';

it('assembles a daily prompt request with the required theme mix', () => {
  const prompt = assembleDailyPrompt({ theme: 'finance' });

  expect(prompt.system).toContain('finance/tech dominant');
  expect(prompt.system).toContain('occasional professional');
  expect(prompt.user).toContain('finance');
});

it('injects the full taxonomy while treating top errors as priority only', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'We carried out the implementation of the policy.',
    paragraphIndex: 0,
    topErrors: ['noun_plague'],
    vocabCandidates: [],
  });

  for (const type of ERROR_TYPES) {
    expect(prompt.user).toContain(`[${type}]`);
  }
  expect(prompt.user).toContain('Prioritize these recurring error types when relevant: noun_plague');
});

it('asks the utility model to select 3 to 5 prime words from user vocab', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const mock: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({ words: ['risk premium', 'shore up', 'jolt'] });
    },
  };

  const words = await selectPrimeWords(mock, {
    topic: 'AI earnings pressure',
    vocab: [
      { word: 'risk premium', defCn: 'risk return spread', kind: 'phrase' },
      { word: 'shore up', defCn: 'support', kind: 'phrase' },
      { word: 'jolt', defCn: 'shock', kind: 'word' },
      { word: 'marquee', defCn: 'leading', kind: 'word' },
    ],
    model: 'utility-test',
  });

  expect(words).toHaveLength(3);
  expect(captured!.model).toBe('utility-test');
  expect(captured!.system).toContain('3 to 5');
  expect(captured!.user).toContain('AI earnings pressure');
  expect(captured!.user).toContain('risk premium');
});

it('assembles prime prompt text without calling a provider', () => {
  const prompt = assemblePrimePrompt({
    topic: 'chip cycle',
    vocab: [{ word: 'cyclical', defCn: '周期性的', kind: 'word' }],
  });

  expect(prompt.system).toContain('Return ONLY JSON');
  expect(prompt.user).toContain('chip cycle');
  expect(prompt.user).toContain('cyclical');
});

it('validates generated daily prompt JSON', async () => {
  const mock: LLMProvider = {
    async complete() {
      return JSON.stringify({ theme: 'tech', text: 'Explain why AI capex may reshape software margins.' });
    },
  };

  await expect(generateDailyPrompt(mock, { theme: 'tech', model: 'utility-test' }))
    .resolves.toEqual({ theme: 'tech', text: 'Explain why AI capex may reshape software margins.' });
});
