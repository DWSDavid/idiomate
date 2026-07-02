import type {
  Annotation,
  CoachResponse,
  ErrorTally,
  ErrorType,
  FlowAnalysisResponse,
  FlowDrillCheckResponse,
  LessonResponse,
  Pattern,
  PatternUsageCheckResponse,
  MistakeLogItem,
  MistakeRankingItem,
  Prompt,
  PromptLibraryResponse,
  ProgressResponse,
  ResearchResponse,
  SentenceLabDiagnosisResponse,
  SentenceLabResultResponse,
  SentenceTranslationResponse,
  SpeakingReviewResponse,
  SessionSaveResult,
  StructureResponse,
  Vocab,
  VocabListItem,
  VocabListResponse,
  SaveVocabResponse,
  AdminUserDetailResponse,
  AdminUsersResponse,
  ChineseVocabResponse,
  FollowUpMode,
  FollowUpResponse,
  FollowUpScope,
  WritingHistoryResponse,
} from '../../shared/types';
import { getClientIdentity, setClientIdentity } from './identity';

// Empty for the same-origin web build; the extension build sets VITE_API_BASE
// to https://idiomate.onrender.com so the panel can reach the backend cross-origin.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

const ACCESS_CODE_KEY = 'idiomate_access_code';
export const ACCESS_DENIED_EVENT = 'idiomate-access-denied';

export interface ProfileResponse {
  tallies: ErrorTally[];
  ranking?: MistakeRankingItem[];
  activation: {
    suggested: number;
    used: number;
  };
}

export interface WordDeepDiveResponse {
  wordFamily: string[];
  nearSynonyms: Array<{ word: string; distinction: string }>;
  usageExamples: string[];
  usageExamplesRich?: Array<{ sentence: string; role?: string }>;
  relatedInYourList: string[];
}

export interface MemoryProfileResponse {
  topWeaknesses: Array<{ errorType: string; count: number }>;
  totalSessions: number;
  sessionEmbeddingsCount: number;
  vocabCount: number;
  vocabByEase: {
    new: number;
    hard: number;
    easy: number;
  };
}

export interface SubmittedAnnotation extends Annotation {
  paragraphIdx: number;
  userRewrite?: string;
  accepted?: boolean;
}

export interface SessionSubmitPayload {
  date?: string;
  promptId?: number;
  draftText: string;
  finalText?: string;
  durationS?: number;
  annotations?: SubmittedAnnotation[];
  primedVocab?: string[];
  source?: 'daily_writing' | 'free_writing';
}

export interface ParagraphResultPayload {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
  paragraph: string;
  rewrite: string;
  nativeText?: string;
  elevatedText?: string;
  evidenceText?: string;
  annotations?: Omit<SubmittedAnnotation, 'paragraphIdx' | 'userRewrite'>[];
}

export interface CoachDiagnosisPayload {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
  paragraph: string;
  nativeText?: string;
  elevatedText?: string;
  annotations?: Omit<SubmittedAnnotation, 'paragraphIdx' | 'userRewrite'>[];
}

export interface FollowUpAnnotationPayload extends Partial<Annotation> {
  span: string;
  errorType: ErrorType;
  userRewrite?: string;
}

export interface FollowUpPayload {
  scope: FollowUpScope;
  mode: FollowUpMode;
  question: string;
  original: string;
  context?: string;
  rewrite?: string;
  nativeVersion?: string;
  annotations?: FollowUpAnnotationPayload[];
}

export interface SpeakingReviewPayload {
  transcript: string;
  context?: string;
  contextLabel?: string;
  contextTitle?: string;
  contextUrl?: string;
  contextExcerpt?: string;
  date?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    globalThis.dispatchEvent?.(new Event(ACCESS_DENIED_EVENT));
  }
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status fallback when the server does not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function readVoid(response: Response): Promise<void> {
  if (response.status === 401) {
    globalThis.dispatchEvent?.(new Event(ACCESS_DENIED_EVENT));
  }
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the status fallback when the server does not return JSON.
    }
    throw new Error(message);
  }
}

export function getStoredAccessCode(): string {
  return globalThis.localStorage?.getItem(ACCESS_CODE_KEY)?.trim() ?? '';
}

export function saveAccessCode(code: string) {
  globalThis.localStorage?.setItem(ACCESS_CODE_KEY, code.trim());
}

function identityHeaders(extra?: HeadersInit): Headers {
  const identity = getClientIdentity();
  const headers = new Headers(extra);
  const accessCode = getStoredAccessCode();
  headers.set('x-user-id', identity.id);
  headers.set('x-user-name', identity.name);
  if (accessCode) headers.set('x-access-code', accessCode);
  return headers;
}

function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(API_BASE + url, {
    ...init,
    headers: identityHeaders(init.headers),
  });
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(readJson<T>);
}

export function getTodayPrompt(): Promise<Prompt> {
  return apiFetch('/api/prompt/today').then(readJson<Prompt>);
}

export function getPromptLibrary(opts?: { limit?: number; savedOnly?: boolean }): Promise<PromptLibraryResponse> {
  const params = new URLSearchParams();
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.savedOnly !== undefined) params.set('saved', String(opts.savedOnly));
  const query = params.toString();
  return apiFetch(`/api/prompt/library${query ? `?${query}` : ''}`).then(readJson<PromptLibraryResponse>);
}

export function savePrompt(id: number, saved = true): Promise<Prompt> {
  return postJson<Prompt>(`/api/prompt/${id}/save`, { saved });
}

export function usePrompt(id: number): Promise<Prompt> {
  return postJson<Prompt>(`/api/prompt/${id}/use`, {});
}

export function primeVocab(promptText: string, limit = 10): Promise<{ topic: string; vocab: Vocab[] }> {
  const params = new URLSearchParams({ promptText, limit: String(limit) });
  return apiFetch(`/api/vocab/prime?${params.toString()}`).then(readJson<{ topic: string; vocab: Vocab[] }>);
}

export function getVocabList(limit = 200): Promise<VocabListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch(`/api/vocab/list?${params.toString()}`).then(readJson<VocabListResponse>);
}

export function getAllVocab(opts?: {
  offset?: number;
  limit?: number;
  sort?: 'date' | 'priority';
  source?: string;
}): Promise<VocabListResponse> {
  const params = new URLSearchParams();
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.sort !== undefined) params.set('sort', opts.sort);
  if (opts?.source !== undefined) params.set('source', opts.source);
  const query = params.toString();
  return apiFetch(`/api/vocab/all${query ? `?${query}` : ''}`).then(readJson<VocabListResponse>);
}

export function getReviewQueue(): Promise<{ items: Vocab[] }> {
  return apiFetch('/api/vocab/review-queue').then(readJson<{ items: Vocab[] }>);
}

export function getTodayVocab(): Promise<{ items: Vocab[] }> {
  return apiFetch('/api/vocab/today').then(readJson<{ items: Vocab[] }>);
}

export function getWordDeepDive(id: number): Promise<WordDeepDiveResponse> {
  return apiFetch(`/api/vocab/${id}/deep-dive`).then(readJson<WordDeepDiveResponse>);
}

export function mergeVocabFamilies(): Promise<{ merged: number }> {
  return postJson<{ merged: number }>('/api/vocab/merge-families', {});
}

export function recordReview(id: number, ease: 'easy' | 'hard'): Promise<void> {
  return apiFetch(`/api/vocab/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ease }),
  }).then(readVoid);
}

export function importOwnerVocab(code: string): Promise<{ imported: number; total: number }> {
  return postJson<{ imported: number; total: number }>('/api/vocab/owner-import', { code });
}

export interface RubiProfileResponse {
  user: {
    id: string;
    name: string;
  };
  imported: number;
  total: number;
  ownerVocabAvailable: boolean;
}

export async function switchToRubiProfile(code: string): Promise<RubiProfileResponse> {
  const result = await postJson<RubiProfileResponse>('/api/profile/rubi', { code });
  setClientIdentity(result.user);
  return result;
}

export function coach(paragraph: string, paragraphIndex: number): Promise<CoachResponse> {
  return postJson<CoachResponse>('/api/coach', { paragraph, paragraphIndex });
}

export function submitSession(payload: SessionSubmitPayload): Promise<SessionSaveResult> {
  return postJson<SessionSaveResult>('/api/sessions', payload);
}

export function recordParagraph(payload: ParagraphResultPayload): Promise<{ id: number }> {
  return postJson<{ id: number }>('/api/paragraph-result', payload);
}

export function recordCoachDiagnosis(payload: CoachDiagnosisPayload): Promise<{ id: number }> {
  return postJson<{ id: number }>('/api/coach-history', payload);
}

export function getProfile(): Promise<ProfileResponse> {
  return apiFetch('/api/profile').then(readJson<ProfileResponse>);
}

export function getMemoryProfile(): Promise<MemoryProfileResponse> {
  return apiFetch('/api/memory/profile').then(readJson<MemoryProfileResponse>);
}

export function getProgress(): Promise<ProgressResponse> {
  return apiFetch('/api/progress').then(readJson<ProgressResponse>);
}

export function getHistory(limit = 100, source?: string): Promise<WritingHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (source) params.set('source', source);
  return apiFetch(`/api/history?${params.toString()}`).then(readJson<WritingHistoryResponse>);
}

export function getAdminUsers(adminCode: string): Promise<AdminUsersResponse> {
  return apiFetch('/api/admin/users', {
    headers: { 'x-admin-code': adminCode },
  }).then(readJson<AdminUsersResponse>);
}

export function getAdminUserDetail(adminCode: string, userId: string): Promise<AdminUserDetailResponse> {
  return apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    headers: { 'x-admin-code': adminCode },
  }).then(readJson<AdminUserDetailResponse>);
}

export function getMistakes(errorType?: ErrorType, limit = 50): Promise<{ mistakes: MistakeLogItem[] }> {
  const params = new URLSearchParams();
  if (errorType) params.set('type', errorType);
  params.set('limit', String(limit));
  return apiFetch(`/api/mistakes?${params.toString()}`).then(readJson<{ mistakes: MistakeLogItem[] }>);
}

export function getLesson(errorType?: ErrorType): Promise<LessonResponse> {
  const params = new URLSearchParams();
  if (errorType) params.set('type', errorType);
  const query = params.toString();
  return apiFetch(`/api/lesson${query ? `?${query}` : ''}`).then(readJson<LessonResponse>);
}

export function researchEssay(essay: string): Promise<ResearchResponse> {
  return postJson<ResearchResponse>('/api/research', { essay });
}

export function structureDraft(draft: string): Promise<StructureResponse> {
  return postJson<StructureResponse>('/api/structure', { draft });
}

export function askFollowUp(payload: FollowUpPayload): Promise<FollowUpResponse> {
  return postJson<FollowUpResponse>('/api/follow-up', {
    ...payload,
    question: payload.question.trim(),
    context: payload.context?.trim() || undefined,
  });
}

export function diagnoseSentenceLab(
  sentence: string,
  context?: string,
): Promise<SentenceLabDiagnosisResponse> {
  return postJson<SentenceLabDiagnosisResponse>('/api/sentence-lab/diagnose', {
    sentence,
    context: context?.trim() || undefined,
  });
}

export function translateSentenceToChinese(
  sentence: string,
  context?: string,
): Promise<SentenceTranslationResponse> {
  return postJson<SentenceTranslationResponse>('/api/sentence-lab/translate', {
    sentence,
    context: context?.trim() || undefined,
  });
}

export function revealSentenceLabResult(
  id: number,
  rewrite: string,
): Promise<SentenceLabResultResponse> {
  return postJson<SentenceLabResultResponse>('/api/sentence-lab/result', { id, rewrite });
}

export function reviewSpeaking(payload: SpeakingReviewPayload): Promise<SpeakingReviewResponse> {
  return postJson<SpeakingReviewResponse>('/api/speaking/review', {
    ...payload,
    transcript: payload.transcript.trim(),
    context: payload.context?.trim() || undefined,
    contextLabel: payload.contextLabel?.trim() || undefined,
    contextTitle: payload.contextTitle?.trim() || undefined,
    contextUrl: payload.contextUrl?.trim() || undefined,
    contextExcerpt: payload.contextExcerpt?.trim() || undefined,
  });
}

export function importVocab(file: File): Promise<{ count: number }> {
  return apiFetch('/api/vocab/import', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'text/plain',
    },
    body: file,
  }).then(readJson<{ count: number }>);
}

export function captureWord(word: string, contextSentence?: string): Promise<Vocab> {
  return postJson<Vocab>('/api/vocab/capture', {
    word,
    contextSentence: contextSentence?.trim() || undefined,
  });
}

export function saveVocab(vocab: Vocab): Promise<SaveVocabResponse> {
  return postJson<SaveVocabResponse>('/api/vocab/save', vocab);
}

export function saveChineseVocab(text: string, contextSentence?: string): Promise<ChineseVocabResponse> {
  return postJson<ChineseVocabResponse>('/api/vocab/from-chinese', {
    text: text.trim(),
    contextSentence: contextSentence?.trim() || undefined,
  });
}

export interface CaptureAndSaveResponse {
  id: number;
  captureCount: number;
  existed: boolean;
  canonicalWord?: string;
  normalized?: string;
  baseForm?: string;
  vocab: Vocab;
}

export function captureAndSaveVocab(word: string, contextSentence?: string): Promise<CaptureAndSaveResponse> {
  return postJson<CaptureAndSaveResponse>('/api/vocab/capture-save', {
    word,
    contextSentence: contextSentence?.trim() || undefined,
  });
}

export interface GraduatedVocabResponse {
  items: VocabListItem[];
}

export function getGraduatedVocab(): Promise<GraduatedVocabResponse> {
  return apiFetch('/api/vocab/graduated').then(readJson<GraduatedVocabResponse>);
}

export function analyzeFlow(draft: string, context?: string): Promise<FlowAnalysisResponse> {
  return postJson<FlowAnalysisResponse>('/api/flow/analyze', {
    draft: draft.trim(),
    context: context?.trim() || undefined,
  });
}

export function checkFlowDrill(payload: {
  drillPrompt: string;
  targetSkill: string;
  attempt: string;
}): Promise<FlowDrillCheckResponse> {
  return postJson<FlowDrillCheckResponse>('/api/flow/drill/check', {
    drillPrompt: payload.drillPrompt,
    targetSkill: payload.targetSkill,
    attempt: payload.attempt.trim(),
  });
}

export function getPatterns(): Promise<{ items: Pattern[] }> {
  return apiFetch('/api/patterns').then(readJson<{ items: Pattern[] }>);
}

export function addPattern(payload: {
  phrase: string;
  preposition?: string;
  example?: string;
  note?: string;
}): Promise<Pattern> {
  return postJson<Pattern>('/api/patterns', {
    phrase: payload.phrase.trim(),
    preposition: payload.preposition?.trim() || undefined,
    example: payload.example?.trim() || undefined,
    note: payload.note?.trim() || undefined,
  });
}

export function reviewPattern(id: number, correct: boolean): Promise<Pattern> {
  return postJson<Pattern>(`/api/patterns/${id}/review`, { correct });
}

export function deletePattern(id: number): Promise<void> {
  return apiFetch(`/api/patterns/${id}`, { method: 'DELETE' }).then(readVoid);
}

export function checkPatternUsage(payload: {
  phrase: string;
  preposition: string;
  sentence: string;
}): Promise<PatternUsageCheckResponse> {
  return postJson<PatternUsageCheckResponse>('/api/patterns/check-usage', {
    phrase: payload.phrase,
    preposition: payload.preposition,
    sentence: payload.sentence.trim(),
  });
}
