import type {
  ErrorType,
  LessonComparisonPair,
  MistakeLogItem,
  NewsItem,
  ResearchSource,
  Vocab,
} from '../../../shared/types.js';
import { ERROR_TYPES } from '../../../shared/types.js';
import { ALL_ERROR_TYPES, ERROR_TAXONOMY } from './taxonomy.js';
import { GRAMMAR_RULES, type GrammarRule, rulesForTypes } from './rules.js';
import type { LLMProvider } from './provider.js';
import { dailyPromptZ, primeWordsZ } from './schema.js';

export interface CoachPromptContext {
  paragraph: string;
  paragraphIndex: number;
  topErrors: ErrorType[];
  vocabCandidates: Pick<Vocab, 'word' | 'defCn'>[];
}

export interface LessonPromptRule {
  name: string;
  principle: string;
  mindset?: string;
  example?: LessonComparisonPair;
}

export interface LessonPromptContext {
  errorType: ErrorType;
  rules: LessonPromptRule[];
  pastInstances: MistakeLogItem[];
  seedPairs: LessonComparisonPair[];
}

export interface ResearchPromptContext {
  essay: string;
}

export interface SourceSummaryPromptContext {
  essay: string;
  sources: NewsItem[];
}

export interface ResearchIntegrationPromptContext {
  essay: string;
  sources: ResearchSource[];
}

export interface StructurePromptContext {
  draft: string;
}

export interface SentenceLabPromptContext {
  sentence: string;
  context?: string;
  topErrors: ErrorType[];
}

function taxonomyReferenceSnippet(types: ErrorType[]): string {
  const seen = new Set<ErrorType>();
  const lines: string[] = [];
  for (const type of types) {
    if (seen.has(type)) continue;
    seen.add(type);
    const entry = ERROR_TAXONOMY[type];
    if (!entry) continue;
    lines.push(`- [${type}] ${entry.name}: ${entry.whatItIs}`);
  }
  return lines.join('\n');
}

function rulesReferenceSnippet(rules: GrammarRule[] = GRAMMAR_RULES): string {
  return rules
    .map(rule => `- ${rule.name}: ${rule.principle}`)
    .join('\n');
}

export function assembleCoachPrompt(ctx: CoachPromptContext): { system: string; user: string } {
  const snippet = taxonomyReferenceSnippet(ALL_ERROR_TYPES);
  const focusedRules = rulesForTypes(ctx.topErrors);
  const ruleSnippet = rulesReferenceSnippet(focusedRules.length ? focusedRules : undefined);
  const vocab = ctx.vocabCandidates.length
    ? ctx.vocabCandidates.map(v => `- ${v.word}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n')
    : '- none';
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';

  return {
    system: [
      'You are a writing coach for an advanced Chinese-L1 writer.',
      'NEVER rewrite the whole text for them as the primary output.',
      'Identify issues, name each by errorType, set the most specific named rule, give a one-line hint that does NOT reveal the fix, a one-line explanation of why, a short ruleExample, and a separate modelRewrite that the UI will hide until the user has tried.',
      "For ruleExample, ruleExample.before MUST come from the user's own text for this exact issue, or be closely based on that text. ruleExample.after MUST be the corrected form of that same minimal pair. NEVER copy the example sentences from the Taxonomy or Rules sections; those references are for classification only, not output. If no faithful minimal pair fits, generate a fresh pair specific to this user's error and do not reuse a reference example.",
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name (for example "Gerund after certain verbs") in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a fully natural version of the whole paragraph. The UI hides both modelRewrite and nativeVersion until the user submits their own rewrite.',
      'Use vocab_suggestion only for optional vocabulary opportunities. Suggest, never force.',
      'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?}]}.',
    ].join(' '),
    user: [
      `Paragraph index: ${ctx.paragraphIndex}`,
      `Paragraph:\n${ctx.paragraph}`,
      `Prioritize these recurring error types when relevant: ${topErrors}`,
      `Vocabulary candidates:\n${vocab}`,
      `Taxonomy:\n${snippet}`,
      `Named grammar and Chinglish rules:\n${ruleSnippet}`,
    ].join('\n\n'),
  };
}

export function assembleLessonPrompt(ctx: LessonPromptContext): { system: string; user: string } {
  const rules = ctx.rules.length
    ? ctx.rules.map(rule => [
        `- ${rule.name}: ${rule.principle}`,
        rule.mindset ? `  mindset: ${rule.mindset}` : undefined,
        rule.example ? `  seed pair: "${rule.example.before}" -> "${rule.example.after}"` : undefined,
      ].filter(Boolean).join('\n')).join('\n')
    : '- none';
  const instances = ctx.pastInstances.length
    ? ctx.pastInstances.map(instance => [
        `- span: ${instance.span}`,
        instance.userRewrite ? `  user rewrite: ${instance.userRewrite}` : undefined,
        instance.rule ? `  rule: ${instance.rule}` : undefined,
        instance.date ? `  date: ${instance.date}` : undefined,
      ].filter(Boolean).join('\n')).join('\n')
    : '- none yet';
  const seedPairs = ctx.seedPairs.length
    ? ctx.seedPairs.map(pair => `- "${pair.before}" -> "${pair.after}"`).join('\n')
    : '- none';

  return {
    system: [
      'You create one systematic grammar lesson for Idiomate.',
      'The learner is an advanced Chinese-L1 English writer.',
      'The explanations, principle, and mindset may be in Chinese for clarity.',
      'The before/after pairs must stay in English.',
      'Use the learner past instances to tailor the lesson.',
      'Return ONLY JSON matching: {principle,mindset,extraPairs:[{before,after,note?}]}.',
      'Return additional comparison pairs, not repeats of the seed pairs.',
      'The final lesson will combine seed pairs with your extraPairs, so provide enough extraPairs to reach 4 to 6 total pairs.',
    ].join(' '),
    user: [
      `Error type: ${ctx.errorType}`,
      `Rules:\n${rules}`,
      `Past instances:\n${instances}`,
      `Seed comparison pairs:\n${seedPairs}`,
      'Return additional comparison pairs tailored to the past instances.',
    ].join('\n\n'),
  };
}

export function assembleResearchPrompt(ctx: ResearchPromptContext): { system: string; user: string } {
  return {
    system: [
      'You are an argument analyst for Idiomate.',
      'Evaluate the content after the learner has already polished language.',
      'Analyze whether the argument is correct, convincing, sufficiently supported, and structurally clear.',
      'Return ONLY JSON matching: {analysis,otherAngles,searchQueries}.',
      'analysis should cover strengths and gaps in one concise paragraph.',
      'otherAngles should list angles the writer may want to consider.',
      'searchQueries should be 2 to 4 concrete news queries likely to find current evidence with links.',
    ].join(' '),
    user: [
      'Essay:',
      ctx.essay,
      'Analyze the content and propose search queries for sourced research.',
    ].join('\n\n'),
  };
}

export function assembleSourceSummaryPrompt(ctx: SourceSummaryPromptContext): { system: string; user: string } {
  const sources = ctx.sources.length
    ? ctx.sources.map((source, index) => [
        `${index + 1}. ${source.title}`,
        `link: ${source.link}`,
        source.source ? `source: ${source.source}` : undefined,
      ].filter(Boolean).join('\n')).join('\n\n')
    : 'No sources.';

  return {
    system: [
      'You write one-sentence summaries of news sources for Idiomate research.',
      'Use only the title, link, and source name provided.',
      'Do not invent facts beyond the visible source metadata.',
      'Return ONLY JSON matching: {sources:[{title,link,summary}]}.',
    ].join(' '),
    user: [
      `Essay:\n${ctx.essay}`,
      `Sources:\n${sources}`,
      'Summarize each source in one sentence for a writer deciding whether to cite it.',
    ].join('\n\n'),
  };
}

export function assembleResearchIntegrationPrompt(ctx: ResearchIntegrationPromptContext): { system: string; user: string } {
  const sources = ctx.sources.length
    ? ctx.sources.map((source, index) => [
        `${index + 1}. ${source.title}`,
        `link: ${source.link}`,
        `summary: ${source.summary}`,
      ].join('\n')).join('\n\n')
    : 'No external sources were available. Create a structure-only integrated essay without inventing citations.';

  return {
    system: [
      'You create an evidence-integrated rewrite for Idiomate.',
      'Preserve the learner argument and voice while modeling stronger content structure.',
      'Weave relevant evidence into appropriate positions instead of appending a source dump.',
      'Use citations by source title or link only when sources are provided.',
      'When no sources are provided, improve the structure without inventing outside evidence.',
      'Model a clear sequence: topic sentence / claim / evidence / commentary.',
      'Return ONLY JSON matching: {integratedEssay,integrationNotes:[{insertedAfter,what,why,structurePart}]}.',
      'structurePart MUST be one of: topic sentence, claim, evidence, commentary.',
    ].join(' '),
    user: [
      `Essay:\n${ctx.essay}`,
      `Sources:\n${sources}`,
      'Produce the integrated essay and explain each insertion with where, what, why, and structural slot.',
    ].join('\n\n'),
  };
}

export function assembleStructurePrompt(ctx: StructurePromptContext): { system: string; user: string } {
  return {
    system: [
      'You are a writing structure coach for Idiomate.',
      'Diagnose the organization of the draft without rewriting it.',
      'Suggest an ideal outline for this draft, then assess how the current draft matches each part.',
      'The ideal outline should usually include topic sentence, claim or explanation, evidence, commentary, and optional conclusion when useful.',
      'Return ONLY JSON matching: {idealOutline:[{part,purpose}],observations:[{part,status,note}]}.',
      'status MUST be exactly one of: present, weak, missing.',
      'Use concise notes that help the writer see what to add, remove, or move.',
    ].join(' '),
    user: [
      'Draft:',
      ctx.draft,
      'Assess the draft against a clear topic sentence, explanation, evidence, and commentary structure.',
    ].join('\n\n'),
  };
}

export function assembleSentenceLabPrompt(ctx: SentenceLabPromptContext): { system: string; user: string } {
  const snippet = taxonomyReferenceSnippet(ALL_ERROR_TYPES);
  const focusedRules = rulesForTypes(ctx.topErrors);
  const ruleSnippet = rulesReferenceSnippet(focusedRules.length ? focusedRules : undefined);
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';

  return {
    system: [
      'You are the Idiomate Sentence Lab coach for an advanced Chinese-L1 writer.',
      'Judge whether one sentence sounds natural in the stated context.',
      'If it is natural, return no annotations and a nativeVersion that may match the original.',
      'If it is unnatural, identify the smallest useful spans, name the specific grammar or Chinglish pattern, and give hints that do NOT reveal the fix.',
      'The explanation should name what is wrong, why it feels unnatural, and the grammar or mindset involved.',
      'For ruleExample, ruleExample.before MUST come from the user sentence for this exact issue, and ruleExample.after MUST be the corrected minimal pair. The API will hide ruleExample and all rewrites until the user submits their own rewrite.',
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a natural version of the whole sentence for the provided context.',
      'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?}]}.',
    ].join(' '),
    user: [
      'Sentence Lab input:',
      ctx.sentence,
      `Context: ${ctx.context?.trim() || 'none provided'}`,
      `Prioritize these recurring error types when relevant: ${topErrors}`,
      `Taxonomy:\n${snippet}`,
      `Named grammar and Chinglish rules:\n${ruleSnippet}`,
    ].join('\n\n'),
  };
}

export function assembleDailyPrompt(ctx: { theme: string }): { system: string; user: string } {
  return {
    system: [
      'You generate concise daily writing prompts for Idiomate.',
      'The prompt bank should be finance/tech dominant with occasional professional/workplace themes.',
      'Return ONLY JSON matching: {theme,text}.',
    ].join(' '),
    user: [
      `Requested theme: ${ctx.theme}`,
      'Write one practical prompt for an advanced Chinese-L1 English writer.',
      'The prompt should invite a clear paragraph-length argument, not a list.',
    ].join('\n'),
  };
}

export function assembleNewsPrompt(ctx: { topic: string; headlines: string[] }): { system: string; user: string } {
  const headlines = ctx.headlines.length
    ? ctx.headlines.map((headline, index) => `${index + 1}. ${headline}`).join('\n')
    : 'No fresh headlines were available. Generate a timely but non-specific discussion prompt from the topic alone.';

  return {
    system: [
      'You generate one fresh discussion-style writing prompt for Idiomate.',
      'Aim it at academic writing and professional discussion prep for an advanced Chinese-L1 English writer.',
      'Ground the prompt in the supplied headlines when they are available.',
      'The prompt should start naturally, often with "What\'s your view on", and invite a paragraph-length argument rather than a list.',
      'Return ONLY JSON matching: {theme,text}.',
    ].join(' '),
    user: [
      `Topic: ${ctx.topic}`,
      `Headlines:\n${headlines}`,
      'Write one fresh prompt with a concrete angle. Do not copy a headline verbatim.',
      "What's your view prompt:",
    ].join('\n\n'),
  };
}

export interface PrimePromptContext {
  topic: string;
  vocab: Pick<Vocab, 'word' | 'defCn' | 'kind'>[];
  limit?: number;
}

export function assemblePrimePrompt(ctx: PrimePromptContext): { system: string; user: string } {
  const vocab = ctx.vocab.map(v => `- ${v.word}${v.kind ? ` (${v.kind})` : ''}${v.defCn ? `: ${v.defCn}` : ''}`).join('\n');
  const limit = ctx.limit ?? 10;
  return {
    system: [
      'You select vocabulary activation candidates for a writing practice session.',
      `Choose up to ${limit} words, phrases, or collocations that naturally fit the full prompt text.`,
      'Favor phrases and collocations, especially terms useful for academic or professional writing.',
      'Use recency and memory value only as secondary signals; relevance to the prompt wins.',
      'Return ONLY JSON matching: {words:[string]}.',
    ].join(' '),
    user: [
      `Full prompt text: ${ctx.topic}`,
      `User vocabulary candidates:\n${vocab || '- none'}`,
    ].join('\n\n'),
  };
}

export async function generateDailyPrompt(
  provider: LLMProvider,
  ctx: { theme: string; model: string },
): Promise<{ theme: string; text: string }> {
  const { system, user } = assembleDailyPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return dailyPromptZ.parse(JSON.parse(raw));
}

export async function generateNewsPrompt(
  provider: LLMProvider,
  ctx: { topic: string; headlines: string[]; model: string },
): Promise<{ theme: string; text: string }> {
  const { system, user } = assembleNewsPrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return dailyPromptZ.parse(JSON.parse(raw));
}

export async function selectPrimeWords(
  provider: LLMProvider,
  ctx: PrimePromptContext & { model: string },
): Promise<string[]> {
  const { system, user } = assemblePrimePrompt(ctx);
  const raw = await provider.complete({ system, user, model: ctx.model });
  return primeWordsZ.parse(JSON.parse(raw)).words;
}
