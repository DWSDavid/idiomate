import { expect, it } from 'vitest';
import {
  assembleFlowDrillCheckPrompt,
  assembleFlowPrompt,
  analyzeFlow,
  checkFlowDrill,
} from '../src/brain/flow.js';
import type { LLMProvider } from '../src/brain/provider.js';

it('assembles a flow prompt that frames per-sentence, previous-relative coaching with vocab seeds', () => {
  const prompt = assembleFlowPrompt({
    draft: 'I read a lot. My writing is still weak.',
    context: 'reflection',
    vocab: ['entrenched', 'as a result'],
  });

  expect(prompt.system).toContain('relation to the PREVIOUS sentence');
  expect(prompt.system).toContain('linkToPrevious');
  expect(prompt.system).toContain('tenseNote');
  expect(prompt.system).toContain('write-your-own');
  expect(prompt.system).toContain('Return ONLY JSON matching');
  expect(prompt.user).toContain('I read a lot. My writing is still weak.');
  expect(prompt.user).toContain('- entrenched');
  expect(prompt.user).toContain('- as a result');
});

it('notes when no vocab is available for seeding', () => {
  const prompt = assembleFlowPrompt({ draft: 'A short draft to analyze.', vocab: [] });
  expect(prompt.user).toContain('(none provided)');
});

it('parses a flow analysis and defaults missing arrays and nullable notes', async () => {
  const provider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        lines: [
          {
            original: 'I read a lot.',
            rewrite: 'I read widely.',
            // pieces/changes omitted -> should default to []
            linkToPrevious: null,
            tenseNote: null,
            drill: {
              prompt: 'Link: "The plan slipped. The launch moved." using a cause connective.',
              targetSkill: 'cause-effect connective',
              vocabUsed: ['as a result'],
              modelAnswer: 'The plan slipped; as a result, the launch moved.',
            },
          },
          {
            original: 'My writing is still weak.',
            pieces: ['writing feels weak'],
            rewrite: 'Even so, my writing still feels weak.',
            linkToPrevious: { connective: 'Even so', why: 'concession against the prior point' },
            tenseNote: { tense: 'present', why: 'ongoing state' },
            changes: ['added concession connective'],
            drill: {
              prompt: 'Link two ideas with a concession.',
              targetSkill: 'concession + present tense',
              vocabUsed: [],
              modelAnswer: 'Even though I practice daily, my speaking still feels stiff.',
            },
          },
        ],
      });
    },
  };

  const result = await analyzeFlow(provider, { draft: 'I read a lot. My writing is still weak.', vocab: [], model: 'm' });

  expect(result.lines).toHaveLength(2);
  expect(result.lines[0].pieces).toEqual([]);
  expect(result.lines[0].changes).toEqual([]);
  expect(result.lines[0].linkToPrevious).toBeNull();
  expect(result.lines[1].linkToPrevious?.connective).toBe('Even so');
  expect(result.lines[1].tenseNote?.tense).toBe('present');
  expect(result.lines[1].drill.targetSkill).toBe('concession + present tense');
});

it('grades a flow drill attempt', async () => {
  let captured: { system: string; user: string; model: string } | undefined;
  const provider: LLMProvider = {
    async complete(opts) {
      captured = opts;
      return JSON.stringify({
        correct: true,
        feedback: 'Good use of "as a result" with past tense.',
        modelAnswer: 'The plan slipped; as a result, the launch moved.',
      });
    },
  };

  const result = await checkFlowDrill(provider, {
    drillPrompt: 'Link the two ideas with a cause connective.',
    targetSkill: 'cause-effect connective',
    attempt: 'The plan slipped, as a result the launch moved.',
    model: 'm',
  });

  expect(result.correct).toBe(true);
  expect(result.feedback).toContain('as a result');
  expect(captured!.user).toContain('cause-effect connective');
  expect(captured!.system).toContain('grade a single write-your-own flow drill');
});

it('assembles a drill-check prompt with the attempt and target skill', () => {
  const prompt = assembleFlowDrillCheckPrompt({
    drillPrompt: 'Link two ideas.',
    targetSkill: 'concession + present tense',
    attempt: 'Even though I study, I forget.',
  });

  expect(prompt.user).toContain('Even though I study, I forget.');
  expect(prompt.user).toContain('concession + present tense');
  expect(prompt.system).toContain('Return ONLY JSON matching: {correct,feedback,modelAnswer}');
});
