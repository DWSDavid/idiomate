import { describe, it, expect } from 'vitest';
import {
  assembleCoachPrompt,
  assembleDailyPrompt,
  assembleLessonPrompt,
  assembleNewsPrompt,
  assemblePrimePrompt,
  generateNewsPrompt,
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

it('injects focused named grammar rules for recurring errors', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'We carried out the implementation of the policy.',
    paragraphIndex: 0,
    topErrors: ['noun_plague'],
    vocabCandidates: [],
  });

  expect(prompt.user).toContain('Named grammar and Chinglish rules');
  expect(prompt.user).toContain('Prefer a verb over a noun string');
  expect(prompt.system).toContain('nativeVersion');
  expect(prompt.system).toContain('ruleExample');
});

it('requires ruleExample to be contextual and keeps reference examples out of coach snippets', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'The rain made a huge effect on our sales and we discussed about it.',
    paragraphIndex: 1,
    topErrors: ['word_choice', 'small_grammar'],
    vocabCandidates: [],
  });

  expect(prompt.system).toContain('ruleExample.before MUST come from the user');
  expect(prompt.system).toContain('NEVER copy the example sentences from the Taxonomy or Rules sections');
  expect(prompt.user).not.toContain('Heavy rain made a big influence on sales');
  expect(prompt.user).not.toContain('She is teacher.');
  expect(prompt.user).not.toContain('discussed the plan');
  expect(prompt.user).toContain('Word choice / collocation');
  expect(prompt.user).toContain('Singular count noun needs an article');
});

it('assembles a bilingual lesson prompt from rules and the user past instances', () => {
  const prompt = assembleLessonPrompt({
    errorType: 'noun_plague',
    rules: [{
      name: 'Prefer a verb over a noun string',
      principle: 'Replace an abstract noun phrase propped up by an empty verb with a single strong verb.',
      mindset: '中文里常先搭一个抽象名词框架, 英文更常直接让动词承担动作.',
      example: { before: 'carried out the implementation of the policy', after: 'implemented the policy' },
    }],
    pastInstances: [{
      errorType: 'noun_plague',
      span: 'implementation of the policy',
      userRewrite: 'implemented the policy',
      rule: 'Prefer a verb over a noun string',
      date: '2026-06-05',
    }],
    seedPairs: [
      { before: 'carried out the implementation of the policy', after: 'implemented the policy' },
    ],
  });

  expect(prompt.system).toContain('explanations, principle, and mindset may be in Chinese');
  expect(prompt.system).toContain('before/after pairs must stay in English');
  expect(prompt.user).toContain('noun_plague');
  expect(prompt.user).toContain('implementation of the policy');
  expect(prompt.user).toContain('Prefer a verb over a noun string');
  expect(prompt.user).toContain('中文里常先搭一个抽象名词框架');
  expect(prompt.user).toContain('Return additional comparison pairs');
});

it('falls back to the full named rule set when recurring errors are sparse', () => {
  const prompt = assembleCoachPrompt({
    paragraph: "Let's started with an example.",
    paragraphIndex: 0,
    topErrors: [],
    vocabCandidates: [],
  });

  expect(prompt.user).toContain("Let's + base verb");
  expect(prompt.user).toContain('Prefer a verb over a noun string');
});

it('asks the utility model to select up to 10 topic-fit prime words from user vocab', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const mock: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        words: [
          'risk premium',
          'shore up',
          'margin pressure',
          'capital intensity',
          'jolt',
          'price in',
          'runway',
          'soft landing',
          'moat',
          'cyclical',
        ],
      });
    },
  };

  const words = await selectPrimeWords(mock, {
    topic: 'Should investors treat AI infrastructure spending as a durable moat or margin risk?',
    vocab: [
      { word: 'risk premium', defCn: 'risk return spread', kind: 'phrase' },
      { word: 'shore up', defCn: 'support', kind: 'phrase' },
      { word: 'margin pressure', defCn: 'profit stress', kind: 'collocation' },
      { word: 'capital intensity', defCn: 'large investment needs', kind: 'collocation' },
      { word: 'jolt', defCn: 'shock', kind: 'word' },
      { word: 'price in', defCn: 'reflect in valuation', kind: 'phrase' },
      { word: 'runway', defCn: 'future growth space', kind: 'word' },
      { word: 'soft landing', defCn: 'controlled slowdown', kind: 'phrase' },
      { word: 'moat', defCn: 'competitive protection', kind: 'word' },
      { word: 'cyclical', defCn: 'moves with cycles', kind: 'word' },
    ],
    model: 'utility-test',
    limit: 10,
  });

  expect(words).toHaveLength(10);
  expect(captured!.model).toBe('utility-test');
  expect(captured!.system).toContain('10');
  expect(captured!.system).toContain('academic or professional writing');
  expect(captured!.user).toContain('Should investors treat AI infrastructure spending');
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

it('assembles a news-grounded discussion prompt from headlines', () => {
  const prompt = assembleNewsPrompt({
    topic: 'humanoid robotics',
    headlines: [
      'Humanoid robots enter warehouses',
      'Robotics firms sign new chip deals',
    ],
  });

  expect(prompt.system).toContain('academic writing');
  expect(prompt.system).toContain('professional discussion');
  expect(prompt.system).toContain('Return ONLY JSON');
  expect(prompt.user).toContain('humanoid robotics');
  expect(prompt.user).toContain('Humanoid robots enter warehouses');
  expect(prompt.user).toContain("What's your view");
});

it('validates generated news prompt JSON and sends headlines to the provider', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const mock: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        theme: 'humanoid robotics',
        text: 'What is your view on whether humanoid robots will improve productivity without weakening worker bargaining power?',
      });
    },
  };

  const prompt = await generateNewsPrompt(mock, {
    topic: 'humanoid robotics',
    headlines: ['Humanoid robots enter warehouses'],
    model: 'utility-test',
  });

  expect(prompt.text).toContain('humanoid robots');
  expect(captured!.model).toBe('utility-test');
  expect(captured!.user).toContain('Humanoid robots enter warehouses');
});
