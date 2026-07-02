import type { FlowAnalysisResponse, FlowDrillCheckResponse } from '../../../shared/types.js';
import type { LLMProvider } from './provider.js';
import { flowAnalysisZ, flowDrillCheckZ } from './schema.js';

export interface FlowAnalysisContext {
  draft: string;
  context?: string;
  vocab: string[]; // the writer's saved words/collocations, to seed drills
}

export interface FlowDrillCheckContext {
  drillPrompt: string;
  targetSkill: string;
  attempt: string;
}

export function assembleFlowPrompt(ctx: FlowAnalysisContext): { system: string; user: string } {
  const vocab = ctx.vocab.length
    ? ctx.vocab.map(word => `- ${word}`).join('\n')
    : '- (none provided)';

  return {
    system: [
      'You are the Idiomate Flow Coach for an advanced Chinese-L1 English writer.',
      'The writer can find good vocabulary but struggles to (1) link sentences with the right connective, (2) choose the right tense for the context, and (3) break one long, illogical sentence into smaller logical pieces.',
      'Split the draft into its sentences IN ORDER. For EACH sentence, coach it in relation to the PREVIOUS sentence.',
      'For each sentence return: original (the sentence as written); pieces (the distinct logical sub-ideas it contains); rewrite (an improved version that splits run-ons into logical pieces, fixes tense, chooses the right connective, and adds which/that when a relative clause is clearer).',
      'linkToPrevious: the connective decision relative to the PREVIOUS sentence, as {connective, why}. connective is the concrete move (e.g. "Even though", "As a result", "However", "merge into one sentence", "relative clause (which)"). why MUST explain the reason the move fits (contrast, cause-effect, concession, addition, or a clarity/structure reason) — never say only "more natural". Use null for the first sentence.',
      'tenseNote: {tense, why} ONLY when tense is a genuine teaching point for this sentence; otherwise null. why explains why that tense fits this context (ongoing state, completed action, general truth, etc.).',
      'changes: a short list of what changed and why (e.g. calque fixed, split into two, added relative pronoun).',
      'drill: a NEW short practice task in a SIMILAR context that trains the SAME skill this sentence needed. It must be a write-your-own task: give a mini scenario (usually two short ideas to link) and ask the writer to produce the linked, correctly-tensed version. Seed the drill with 1 to 2 of the writer\'s saved words listed below when they fit, and set vocabUsed to exactly those words. targetSkill names the skill (e.g. "concession connective + present tense"). modelAnswer is the ideal answer (hidden from the writer until they try).',
      'Keep every rewrite faithful to the writer\'s meaning and voice. Do not invent facts.',
      'Return ONLY JSON matching: {lines:[{original,pieces,rewrite,linkToPrevious,tenseNote,changes,drill:{prompt,targetSkill,vocabUsed,modelAnswer}}]}.',
    ].join(' '),
    user: [
      `Draft:\n${ctx.draft}`,
      `Overall context (optional): ${ctx.context?.trim() || 'none provided'}`,
      `Writer's saved vocabulary to seed drills from:\n${vocab}`,
      'Coach every sentence in order, each in relation to the one before it.',
    ].join('\n\n'),
  };
}

export function assembleFlowDrillCheckPrompt(ctx: FlowDrillCheckContext): { system: string; user: string } {
  return {
    system: [
      'You grade a single write-your-own flow drill for an advanced Chinese-L1 English writer.',
      'The drill targets a specific skill (a connective choice, a tense choice, or splitting a run-on).',
      'Judge whether the attempt correctly and naturally applies THAT skill. Ignore unrelated minor issues unless they break the sentence.',
      'feedback: name the connective and tense the writer used, say what worked, and give one concrete fix if needed. Chinese may be used when it clarifies the mindset.',
      'modelAnswer: the ideal version of the drill.',
      'Return ONLY JSON matching: {correct,feedback,modelAnswer}.',
    ].join(' '),
    user: [
      `Drill task: ${ctx.drillPrompt}`,
      `Target skill: ${ctx.targetSkill}`,
      `Writer's attempt: ${ctx.attempt}`,
    ].join('\n\n'),
  };
}

export async function analyzeFlow(
  provider: LLMProvider,
  ctx: FlowAnalysisContext & { model: string },
): Promise<FlowAnalysisResponse> {
  const { system, user } = assembleFlowPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return flowAnalysisZ.parse(JSON.parse(raw));
}

export async function checkFlowDrill(
  provider: LLMProvider,
  ctx: FlowDrillCheckContext & { model: string },
): Promise<FlowDrillCheckResponse> {
  const { system, user } = assembleFlowDrillCheckPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return flowDrillCheckZ.parse(JSON.parse(raw));
}
