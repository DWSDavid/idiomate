import type {
  ErrorType,
  FollowUpMode,
  FollowUpScope,
  LessonComparisonPair,
  MistakeLogItem,
  NewsItem,
  ResearchSource,
  SourceQuote,
  Vocab,
} from '../../../shared/types.js';
import { ERROR_TYPES } from '../../../shared/types.js';
import { ALL_ERROR_TYPES, ERROR_TAXONOMY } from './taxonomy.js';
import { GRAMMAR_RULES, type GrammarRule, rulesForTypes } from './rules.js';
import type { LLMProvider } from './provider.js';
import { dailyPromptZ, primeWordsZ, sourceQuotesZ } from './schema.js';

export interface CoachPromptContext {
  paragraph: string;
  paragraphIndex: number;
  topErrors: ErrorType[];
  vocabCandidates: Pick<Vocab, 'word' | 'defCn'>[];
  memoryContext?: PromptMemoryContext;
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
  memoryContext?: PromptMemoryContext;
}

export interface SpeakingReviewPromptContext {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  topErrors: ErrorType[];
  memoryContext?: PromptMemoryContext;
}

export interface PromptMemoryContext {
  topWeaknesses: string[];
  relevantSnippets: string[];
}

export interface FollowUpPromptAnnotation {
  span: string;
  errorType: ErrorType;
  hint?: string;
  explanation?: string;
  rule?: string;
  ruleExample?: { before: string; after: string };
  bookReference?: {
    source: string;
    pattern: string;
    quote?: string;
    quoteStatus?: string;
  };
  modelRewrite?: string;
  userRewrite?: string;
}

export interface FollowUpPromptContext {
  scope: FollowUpScope;
  mode: FollowUpMode;
  question: string;
  original: string;
  context?: string;
  rewrite?: string;
  nativeVersion?: string;
  annotations: FollowUpPromptAnnotation[];
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

function memoryContextLines(memoryContext?: PromptMemoryContext): string[] {
  if (!memoryContext) return [];
  const lines: string[] = [];
  const weaknesses = memoryContext.topWeaknesses.filter(Boolean);
  if (weaknesses.length) {
    lines.push(`Persistent weaknesses to watch: ${weaknesses.join(', ')}.`);
  }
  const snippets = memoryContext.relevantSnippets.filter(snippet => snippet.trim());
  lines.push(...snippets.map((s, i) => `Past writing context [${i + 1}]: ${s}`));
  return lines;
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
      'rank the annotations by learning value: recurring grammar norms first, then unnatural Chinglish patterns, then style or vocabulary opportunities.',
      'For grammar, make the underlying norm explicit in explanation, such as base verb after do, has/have been vs simple past, active vs passive, article with singular count noun, or parallel forms.',
      'For Chinglish, explain the Chinese-L1 mindset: why a Chinese speaker may write it this way and how native English packages the idea differently.',
      'For every explanation, include THREE components in this order: (1) Rule: state the specific grammar rule name and what it demands, e.g. "Uncountable nouns in generic reference take zero article." (2) Why: explain the linguistic reason at a semantic or structural level, e.g. "Logistics here refers to the field as a concept, not a specific set of logistics — generic reference uses zero article." (3) Chinese-L1 mindset: explain why a Chinese speaker makes this mistake, e.g. "Chinese has no articles, so learners often add the definite article when a noun feels important enough to warrant one."',
      'For word-order issues (split infinitives, correlative conjunctions like not only...but also, adverb placement): always explain WHY the specific order matters — whether it is a register rule, a clarity rule, or a structural constraint. Never just say "this is more natural."',
      'For countable/uncountable errors: state whether the noun is countable or uncountable IN THIS CONTEXT, explain why, and give a one-sentence test the writer can apply themselves (e.g. "Ask: can I count individual units of this? If not, use zero article or singular form.").',
      'Do not write vague feedback like "choose the correct expression" or "use a better word." For word_choice, provide 1 to 3 concrete replacement options in the explanation, say when each fits, and put the best fit in ruleExample.after/modelRewrite.',
      'Preserve valid domain terminology, emerging tech terms, finance terms, and user-defined terms unless they are clearly wrong in context. Examples of terms to preserve include AI sprawl, open-source models, autonomous agents, risk premium, and model proliferation. If a phrase may be a legitimate term, use rule "terminology_check", explain that it may be kept if intentional, and do not mark it as a diction error unless the context proves misuse.',
      "For ruleExample, ruleExample.before MUST come from the user's own text for this exact issue, or be closely based on that text. ruleExample.after MUST be the corrected form of that same minimal pair. NEVER copy the example sentences from the Taxonomy or Rules sections; those references are for classification only, not output. If no faithful minimal pair fits, generate a fresh pair specific to this user's error and do not reuse a reference example.",
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name (for example "Gerund after certain verbs") in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a fully natural version of the whole paragraph. The UI hides both modelRewrite and nativeVersion until the user submits their own rewrite.',
      'Use vocab_suggestion in two situations: (1) the word or chunk is a calque or direct translation that sounds unnatural — suggest the natural English equivalent; (2) the word or chunk already works but a more idiomatic, native, or domain-specific alternative would elevate the writing — suggest it as an upgrade. For every vocab_suggestion, set vocabWord to the suggested word and add a distinction field: one or two sentences explaining what is wrong or limited about the original AND why the alternative is more natural, precise, or native — include register, domain, or connotation differences. Suggest, never force.',
      'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?,distinction?}]}.',
      ...memoryContextLines(ctx.memoryContext),
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
      'rank the learner common mistakes inside the principle or mindset text when the evidence supports a ranking.',
      'Make grammar norms visible and concrete, including has/have been vs simple past, active/passive choice, articles, verb patterns, and parallel structure when relevant.',
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
      'For every explanation, include THREE components in this order: (1) Rule: state the specific grammar rule name and what it demands, e.g. "Uncountable nouns in generic reference take zero article." (2) Why: explain the linguistic reason at a semantic or structural level, e.g. "Logistics here refers to the field as a concept, not a specific set of logistics — generic reference uses zero article." (3) Chinese-L1 mindset: explain why a Chinese speaker makes this mistake, e.g. "Chinese has no articles, so learners often add the definite article when a noun feels important enough to warrant one."',
      'For word-order issues (split infinitives, correlative conjunctions like not only...but also, adverb placement): always explain WHY the specific order matters — whether it is a register rule, a clarity rule, or a structural constraint. Never just say "this is more natural."',
      'For countable/uncountable errors: state whether the noun is countable or uncountable IN THIS CONTEXT, explain why, and give a one-sentence test the writer can apply themselves (e.g. "Ask: can I count individual units of this? If not, use zero article or singular form.").',
      'Do not write vague feedback like "choose the correct expression" or "use a better word." For word_choice, provide 1 to 3 concrete replacement options in the explanation, say when each fits, and put the best fit in ruleExample.after/modelRewrite.',
      'Preserve valid domain terminology, emerging tech terms, finance terms, and user-defined terms unless they are clearly wrong in context. Examples of terms to preserve include AI sprawl, open-source models, autonomous agents, risk premium, and model proliferation. If a phrase may be a legitimate term, use rule "terminology_check", explain that it may be kept if intentional, and do not mark it as a diction error unless the context proves misuse.',
      'For ruleExample, ruleExample.before MUST come from the user sentence for this exact issue, and ruleExample.after MUST be the corrected minimal pair. The API will hide ruleExample and all rewrites until the user submits their own rewrite.',
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a natural version of the whole sentence for the provided context.',
      'Return ONLY JSON matching: {paragraphIndex,nativeVersion,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?}]}.',
      ...memoryContextLines(ctx.memoryContext),
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

export function assembleSpeakingReviewPrompt(ctx: SpeakingReviewPromptContext): { system: string; user: string } {
  const snippet = taxonomyReferenceSnippet(ALL_ERROR_TYPES);
  const focusedRules = rulesForTypes(ctx.topErrors);
  const ruleSnippet = rulesReferenceSnippet(focusedRules.length ? focusedRules : undefined);
  const topErrors = ctx.topErrors.length ? ctx.topErrors.join(', ') : 'none yet';
  const contextLines = [
    ctx.contextLabel ? `Context label: ${ctx.contextLabel}` : undefined,
    ctx.context ? `User context: ${ctx.context}` : undefined,
    ctx.contextTitle ? `Reading title: ${ctx.contextTitle}` : undefined,
    ctx.contextUrl ? `Reading URL: ${ctx.contextUrl}` : undefined,
    ctx.contextExcerpt ? `Reading excerpt: ${ctx.contextExcerpt}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    system: [
      'You are the Idiomate spoken-expression coach for an advanced Chinese-L1 English user.',
      'Review speech-to-text transcript text for grammar, precision, naturalness, idiomatic spoken English, and Chinese-L1 transfer.',
      'Do not judge pronunciation, accent, tone, pace, intonation, or speaking flow.',
      'Do not turn the transcript into formal essay prose. Preserve natural conversational directness.',
      'Ignore filler words and obvious speech-to-text artifacts unless they change meaning or create a real English issue.',
      'If the transcript already sounds natural for the spoken context, return annotations: [], let nativeVersion match the original or only lightly normalize obvious STT artifacts, and do not force corrective takeaways.',
      'Identify the smallest useful spans, name each errorType, set a specific rule, give a concise hint, explanation, ruleExample, and modelRewrite.',
      'For word_choice, provide concrete alternatives and explain register or connotation differences.',
      'Preserve valid domain terminology, emerging tech terms, finance terms, and user-defined terms unless they are clearly wrong in context. Examples of terms to preserve include AI sprawl, open-source models, autonomous agents, risk premium, and model proliferation. If a phrase may be a legitimate term, use rule "terminology_check", explain that it may be kept if intentional, and do not mark it as a diction error unless the context proves misuse.',
      'For ruleExample, ruleExample.before MUST come from the user transcript for this exact issue, and ruleExample.after MUST be the corrected minimal pair.',
      `The errorType field MUST be EXACTLY one of: ${ERROR_TYPES.join(', ')}. Put the specific principle name in the "rule" field, never in errorType.`,
      'Also produce nativeVersion: a natural spoken version of the whole transcript for the same situation.',
      'When there are real corrections or genuinely useful observations, produce takeaways: up to 4 short points the user should remember next time. For a natural transcript, use takeaways: [] unless a non-corrective note is truly useful.',
      'Return ONLY JSON matching: {nativeVersion,takeaways,annotations:[{span,errorType,rule,ruleExample:{before,after},hint,explanation,modelRewrite,vocabWord?,distinction?}]}.',
    ].join(' '),
    user: [
      'Spoken transcript:',
      ctx.transcript,
      contextLines || 'Context: none provided',
      ...memoryContextLines(ctx.memoryContext),
      `Prioritize these recurring error types when relevant: ${topErrors}`,
      `Taxonomy:\n${snippet}`,
      `Named grammar and Chinglish rules:\n${ruleSnippet}`,
    ].join('\n\n'),
  };
}

function preRewriteAnnotation(annotation: FollowUpPromptAnnotation) {
  return {
    span: annotation.span,
    errorType: annotation.errorType,
    hint: annotation.hint,
    explanation: annotation.explanation,
    rule: annotation.rule,
    bookReference: annotation.bookReference,
  };
}

function postRewriteAnnotation(annotation: FollowUpPromptAnnotation) {
  return {
    span: annotation.span,
    errorType: annotation.errorType,
    hint: annotation.hint,
    explanation: annotation.explanation,
    rule: annotation.rule,
    ruleExample: annotation.ruleExample,
    bookReference: annotation.bookReference,
    modelRewrite: annotation.modelRewrite,
    userRewrite: annotation.userRewrite,
  };
}

export function assembleFollowUpPrompt(ctx: FollowUpPromptContext): { system: string; user: string } {
  const isPreRewrite = ctx.mode === 'pre_rewrite';
  const annotations = ctx.annotations.map(annotation => (
    isPreRewrite ? preRewriteAnnotation(annotation) : postRewriteAnnotation(annotation)
  ));
  const visibleContext = {
    scope: ctx.scope,
    mode: ctx.mode,
    original: ctx.original,
    context: ctx.context,
    ...(isPreRewrite ? {} : {
      rewrite: ctx.rewrite,
      nativeVersion: ctx.nativeVersion,
    }),
    annotations,
  };

  return {
    system: [
      'You answer follow-up questions inside Idiomate.',
      'The learner is an advanced Chinese-L1 English writer.',
      'Be specific, concise, and teaching-oriented. Chinese explanations are allowed when they clarify mindset.',
      isPreRewrite
        ? 'Do not reveal the final answer, native version, model rewrite, exact corrected phrase, or after side of any before/after pair. If the learner asks for the answer, redirect them to try a rewrite first and give a hint or principle instead.'
        : 'The learner has already submitted a rewrite, so you may explain the native version, model rewrite, grammar point, book connection, and comparison pairs.',
      'Return ONLY JSON matching: {answer}.',
    ].join(' '),
    user: [
      `Question: ${ctx.question}`,
      `Visible writing context:\n${JSON.stringify(visibleContext, null, 2)}`,
    ].join('\n\n'),
  };
}

export function assembleDailyPrompt(ctx: { theme: string }): { system: string; user: string } {
  return {
    system: [
      'You generate concise daily writing prompts for Idiomate.',
      'Draw across a broad, varied range of domains (society, ethics, culture, education, science, environment, health, media, work, personal decisions, tech, finance); do not let any single domain dominate.',
      'Return ONLY JSON matching: {theme,text}.',
    ].join(' '),
    user: [
      `Requested theme: ${ctx.theme}`,
      'Write one practical prompt for an advanced Chinese-L1 English writer.',
      'The prompt should invite a clear paragraph-length argument, not a list.',
    ].join('\n'),
  };
}

export function assembleNewsPrompt(ctx: {
  topic: string;
  headlines: string[];
  topErrors?: string[];
  previousPrompts?: string[];
  previousTheme?: string;
}): { system: string; user: string } {
  const headlines = ctx.headlines.length
    ? ctx.headlines.map((headline, index) => `${index + 1}. ${headline}`).join('\n')
    : 'No fresh headlines were available. Generate a timely but non-specific debatable prompt from the topic alone.';
  const errorHint = ctx.topErrors?.length
    ? `The learner commonly makes these errors: ${ctx.topErrors.join(', ')}. When possible, frame the scenario so a natural answer would practise avoiding these patterns.`
    : '';
  const previousPrompts = ctx.previousPrompts?.length
    ? ctx.previousPrompts.map((text, index) => `${index + 1}. ${text}`).join('\n')
    : 'No recent prompt memory.';
  const domainBlock = ctx.previousTheme?.trim()
    ? `The immediately previous prompt was in the domain "${ctx.previousTheme.trim()}". Your new prompt MUST be in a clearly different domain and must not reuse its central subject, examples, or framing.`
    : 'Vary the domain from prompt to prompt so consecutive prompts do not cluster in the same subject area.';

  return {
    system: [
      'You generate one daily writing prompt for Idiomate, tuned for argumentative-essay practice.',
      'The learner is an advanced Chinese-L1 English writer whose core interests are tech and finance, so those remain the backbone of the prompt diet. Stay anchored to the supplied topic and headlines rather than wandering off into unrelated domains.',
      'Every prompt must be DEBATABLE: it must present a contestable position the writer can argue for or against and defend with reasons and evidence. Not a soft "how do you feel" question.',
      domainBlock,
      'Avoid repeating the recent prompt memory in wording OR subject. Do not overuse workplace automation, humanoid robots, or labor-replacement angles unless the supplied headlines truly require them.',
      'Produce TWO calibrated versions of the SAME underlying debate:',
      '- text: a short prompt, maximum 25 words, answerable in 3 to 5 sentences, that still forces the writer to take a clear side (e.g. "Do you agree that X? Argue one side.", "Which matters more, X or Y? Defend your choice.").',
      '- essayPrompt: an essay-length version, 2 to 4 sentences, that frames the same debate as a formal argumentative-essay task: state the contestable claim, invite a thesis, and ask the writer to support a stance with reasons and evidence and to address a counterargument. It may reference the source material for evidence.',
      'Both versions must be answerable from reasoning and opinion, not require insider expert data. Avoid live geopolitics, partisan politics, sports diplomacy, and abstract philosophy with no concrete anchor.',
      'Ground both versions in the supplied headlines when available, but keep them answerable from the writer\'s own reasoning.',
      errorHint,
      'The theme field should name the broad domain (e.g. "education", "media ethics", "personal finance") so downstream logic can avoid repeating it.',
      'Return ONLY JSON matching: {theme,text,essayPrompt}.',
    ].filter(Boolean).join(' '),
    user: [
      `Topic: ${ctx.topic}`,
      `Headlines:\n${headlines}`,
      `Recent prompt memory to avoid (wording and subject):\n${previousPrompts}`,
      'Write one fresh debatable prompt in both a short and an essay-length form. Do not copy a headline verbatim.',
      'Return {theme,text,essayPrompt}.',
    ].join('\n\n'),
  };
}

export interface ElevatePromptContext {
  paragraph: string;
  nativeVersion: string;
}

export function assembleElevatePrompt(ctx: ElevatePromptContext): { system: string; user: string } {
  return {
    system: [
      'You are a senior editor.',
      'Take a grammar-corrected paragraph and elevate it: improve transitions, deepen the argument, add specific commentary, and sharpen the structure.',
      'Do NOT just rephrase.',
      'Return ONLY JSON: {elevatedVersion, elevationNotes} where elevationNotes is one sentence explaining the key structural change.',
    ].join(' '),
    user: [
      `Original paragraph:\n${ctx.paragraph}`,
      `Grammar-corrected version:\n${ctx.nativeVersion}`,
      'Elevate the grammar-corrected version.',
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
      'Separate the choice mentally into single words, fixed combos, and larger chunks; do not let generic single words crowd out useful collocations.',
      'Favor precise phrases and fixed combinations for academic or professional writing, including prepositions and gerund patterns such as design for, make a decision on, worth doing, or move in lockstep when they fit the topic.',
      'Prefer daily-life, tech, and business chunks the learner can reuse, including native slang, niche phrases, and common academic or professional collocations.',
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
  ctx: {
    topic: string;
    headlines: string[];
    model: string;
    topErrors?: string[];
    previousPrompts?: string[];
    previousTheme?: string;
  },
): Promise<{ theme: string; text: string; essayPrompt?: string }> {
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

export interface QuoteArticle {
  title: string;
  link: string;
  source?: string;
  text: string;
}

export interface QuoteExtractionContext {
  promptText: string;
  articles: QuoteArticle[];
}

export function assembleQuoteExtractionPrompt(ctx: QuoteExtractionContext): { system: string; user: string } {
  const articles = ctx.articles
    .map((article, index) => [
      `[Article ${index + 1}] ${article.title}`,
      article.source ? `Source: ${article.source}` : undefined,
      `Link: ${article.link}`,
      `Text: ${article.text}`,
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  return {
    system: [
      'You extract short, quotable sentences from source articles so a writer can cite or paraphrase them in an argumentative essay.',
      'CRITICAL: every quote MUST appear word-for-word in the provided article text. Never paraphrase, never summarize, never invent, never stitch fragments together. If an article has nothing suitable, skip it.',
      'Prefer 1 to 2 sentence quotes that carry a fact, statistic, concrete claim, or vivid phrasing relevant to the prompt debate.',
      'Choose up to 4 quotes total across all articles, most useful first, and avoid near-duplicates.',
      'For each quote, set source to the outlet name and link to the exact article link provided.',
      'Return ONLY JSON matching: {quotes:[{quote,source,link}]}. If no verbatim quote qualifies, return {quotes:[]}.',
    ].join(' '),
    user: [
      `Prompt debate: ${ctx.promptText}`,
      `Articles:\n${articles}`,
      'Extract only verbatim quotes that genuinely help argue this prompt.',
    ].join('\n\n'),
  };
}

// Normalize for verbatim comparison: models often return curly quotes or reflowed whitespace
// even when the substance is copied faithfully. We compare on a punctuation/space-insensitive
// form so we keep genuine copies while still dropping anything not actually in the source.
function normalizeForVerbatim(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”'"`]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

export async function extractSourceQuotes(
  provider: LLMProvider,
  ctx: QuoteExtractionContext & { model: string },
): Promise<SourceQuote[]> {
  const usable = ctx.articles.filter(article => article.text.trim().length > 0);
  if (!usable.length) return [];

  const { system, user } = assembleQuoteExtractionPrompt({ promptText: ctx.promptText, articles: usable });
  const raw = await provider.complete({ system, user, model: ctx.model });
  const parsed = sourceQuotesZ.parse(JSON.parse(raw));

  const haystacks = usable.map(article => normalizeForVerbatim(article.text));
  return parsed.quotes
    .filter(item => {
      const needle = normalizeForVerbatim(item.quote);
      // Guard against fabrication: only keep quotes that literally occur in a fetched article.
      return needle.length >= 12 && haystacks.some(text => text.includes(needle));
    })
    .slice(0, 4);
}
