import { describe, it, expect } from 'vitest';
import {
  assembleCoachPrompt,
  assembleDailyPrompt,
  assembleLessonPrompt,
  assembleNewsPrompt,
  assemblePrimePrompt,
  assembleResearchIntegrationPrompt,
  assembleResearchPrompt,
  assembleSourceSummaryPrompt,
  assembleStructurePrompt,
  extractSourceQuotes,
  generateNewsPrompt,
  generateDailyPrompt,
  selectPrimeWords,
} from '../src/brain/prompts.js';
import { ERROR_TYPES } from '../../shared/types.js';
import type { LLMProvider } from '../src/brain/provider.js';

it('assembles a daily prompt request that spans a broad domain mix', () => {
  const prompt = assembleDailyPrompt({ theme: 'finance' });

  expect(prompt.system).toContain('broad, varied range of domains');
  expect(prompt.system).toContain('do not let any single domain dominate');
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

it('adds memory context to the coach system prompt when available', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'We made a discussion about the forecast.',
    paragraphIndex: 0,
    topErrors: ['noun_plague'],
    vocabCandidates: [],
    memoryContext: {
      topWeaknesses: ['noun_plague', 'article_misuse'],
      relevantSnippets: ['Earlier draft about margin pressure and budget timing.'],
    },
  });

  expect(prompt.system).toContain('Persistent weaknesses to watch: noun_plague, article_misuse.');
  expect(prompt.system).toContain('Past writing context [1]: Earlier draft about margin pressure and budget timing.');
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

it('asks coaching to rank grammar issues and explain the underlying norm', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'He has finished the report yesterday and discussed about it.',
    paragraphIndex: 0,
    topErrors: ['tense', 'small_grammar'],
    vocabCandidates: [],
  });

  expect(prompt.system).toContain('rank the annotations');
  expect(prompt.system).toContain('underlying norm');
  expect(prompt.system).toContain('base verb after do');
  expect(prompt.system).toContain('has/have been vs simple past');
  expect(prompt.system).toContain('active vs passive');
});

it('asks coaching to explain Chinglish mindset instead of only naming the error', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'In this situation, we should make a discussion about the problem.',
    paragraphIndex: 0,
    topErrors: ['calque', 'noun_plague'],
    vocabCandidates: [],
  });

  expect(prompt.system).toContain('Chinese-L1 mindset');
  expect(prompt.system).toContain('why a Chinese speaker may write it this way');
  expect(prompt.system).toContain('how native English packages the idea differently');
});

it('asks coaching to give concrete fixes and preserve valid domain terminology', () => {
  const prompt = assembleCoachPrompt({
    paragraph: 'AI sprawl is irrelevant to this concern.',
    paragraphIndex: 0,
    topErrors: ['word_choice'],
    vocabCandidates: [],
  });

  expect(prompt.system).toContain('Do not write vague feedback like "choose the correct expression"');
  expect(prompt.system).toContain('provide 1 to 3 concrete replacement options');
  expect(prompt.system).toContain('Preserve valid domain terminology');
  expect(prompt.system).toContain('AI sprawl');
  expect(prompt.system).toContain('terminology_check');
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

it('asks lesson prompts for a ranked common-mistake view with concrete grammar norms', () => {
  const prompt = assembleLessonPrompt({
    errorType: 'tense',
    rules: [],
    pastInstances: [],
    seedPairs: [],
  });

  expect(prompt.system).toContain('rank the learner');
  expect(prompt.system).toContain('grammar norms');
  expect(prompt.system).toContain('has/have been vs simple past');
  expect(prompt.system).toContain('active/passive choice');
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
  expect(prompt.system).toContain('daily-life, tech, and business chunks');
  expect(prompt.system).toContain('native slang');
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

  expect(prompt.system).toContain('25 words');
  expect(prompt.system).toContain('3 to 5 sentences');
  expect(prompt.system).toContain('Avoid repeating');
  expect(prompt.system).toContain('humanoid robots');
  expect(prompt.system).toContain('Return ONLY JSON');
  expect(prompt.user).toContain('humanoid robotics');
  expect(prompt.user).toContain('Humanoid robots enter warehouses');
});

it('injects top errors into news prompt system string', () => {
  const prompt = assembleNewsPrompt({
    topic: 'AI infrastructure',
    headlines: [],
    topErrors: ['noun_plague', 'calque'],
    previousPrompts: ['Do you think humanoid robots will replace workers?'],
  });

  expect(prompt.system).toContain('noun_plague');
  expect(prompt.system).toContain('calque');
  expect(prompt.user).toContain('Do you think humanoid robots will replace workers?');
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

it('asks for both a short and an essay-length debatable prompt', () => {
  const prompt = assembleNewsPrompt({ topic: 'personal finance', headlines: [] });

  expect(prompt.system).toContain('essayPrompt');
  expect(prompt.system).toContain('DEBATABLE');
  expect(prompt.system).toContain('argumentative-essay');
  expect(prompt.system).toContain('Return ONLY JSON matching: {theme,text,essayPrompt}.');
});

it('blocks the previous domain when a previous theme is supplied', () => {
  const prompt = assembleNewsPrompt({
    topic: 'education technology',
    headlines: [],
    previousTheme: 'humanoid robotics',
  });

  expect(prompt.system).toContain('clearly different domain');
  expect(prompt.system).toContain('humanoid robotics');
});

it('keeps only verbatim quotes that appear in the fetched article text', async () => {
  const articleText = 'Regulators warned that the rollout was rushed. Adoption doubled in a year despite the risks.';
  const mock: LLMProvider = {
    async complete() {
      return JSON.stringify({
        quotes: [
          { quote: 'Adoption doubled in a year despite the risks.', source: 'The Verge', link: 'https://example.com/a' },
          { quote: 'This sentence was never in the article.', source: 'Fabricated', link: 'https://example.com/b' },
        ],
      });
    },
  };

  const quotes = await extractSourceQuotes(mock, {
    promptText: 'Should new tech ship fast or slow?',
    model: 'utility-test',
    articles: [
      { title: 'Rollout under scrutiny', link: 'https://example.com/a', source: 'The Verge', text: articleText },
    ],
  });

  expect(quotes).toHaveLength(1);
  expect(quotes[0].quote).toContain('Adoption doubled in a year');
  expect(quotes[0].source).toBe('The Verge');
});

it('returns no quotes when no article text was fetched', async () => {
  const mock: LLMProvider = {
    async complete() {
      throw new Error('should not be called when there is no article text');
    },
  };

  const quotes = await extractSourceQuotes(mock, {
    promptText: 'Any debate',
    model: 'utility-test',
    articles: [{ title: 'Paywalled', link: 'https://example.com/x', text: '' }],
  });

  expect(quotes).toEqual([]);
});

it('assembles research prompts for analysis, source summaries, and evidence integration', () => {
  const essay = 'AI capex may pressure margins, but it can also deepen cloud moats.';
  const analysis = assembleResearchPrompt({ essay });
  const summaries = assembleSourceSummaryPrompt({
    essay,
    sources: [
      { title: 'Cloud firms raise AI spending', link: 'https://example.com/ai-capex', source: 'Example Wire' },
    ],
  });
  const integration = assembleResearchIntegrationPrompt({
    essay,
    sources: [
      {
        title: 'Cloud firms raise AI spending',
        link: 'https://example.com/ai-capex',
        summary: 'Cloud providers are increasing AI infrastructure budgets.',
      },
    ],
  });

  expect(analysis.system).toContain('argument analyst');
  expect(analysis.system).toContain('searchQueries');
  expect(analysis.user).toContain('AI capex may pressure margins');
  expect(summaries.system).toContain('one-sentence summaries');
  expect(summaries.user).toContain('https://example.com/ai-capex');
  expect(integration.system).toContain('integratedEssay');
  expect(integration.system).toContain('topic sentence / claim / evidence / commentary');
  expect(integration.user).toContain('Cloud providers are increasing AI infrastructure budgets');
});

it('assembles a structure guidance prompt with outline and draft observations', () => {
  const prompt = assembleStructurePrompt({
    draft: 'AI capex may hurt margins. Companies are spending a lot. Therefore it is risky.',
  });

  expect(prompt.system).toContain('writing structure coach');
  expect(prompt.system).toContain('idealOutline');
  expect(prompt.system).toContain('present');
  expect(prompt.system).toContain('weak');
  expect(prompt.system).toContain('missing');
  expect(prompt.user).toContain('AI capex may hurt margins');
  expect(prompt.user).toContain('topic sentence');
  expect(prompt.user).toContain('evidence');
  expect(prompt.user).toContain('commentary');
});
