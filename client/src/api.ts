import type {
  Annotation,
  CoachResponse,
  ErrorTally,
  ErrorType,
  LessonResponse,
  MistakeLogItem,
  MistakeRankingItem,
  Prompt,
  ProgressResponse,
  ResearchResponse,
  SentenceLabDiagnosisResponse,
  SentenceLabResultResponse,
  StructureResponse,
  Vocab,
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
}

export interface ParagraphResultPayload {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
  paragraph: string;
  rewrite: string;
  annotations?: Omit<SubmittedAnnotation, 'paragraphIdx' | 'userRewrite'>[];
}

export interface CoachDiagnosisPayload {
  date?: string;
  promptId?: number;
  paragraphIdx: number;
  paragraph: string;
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
  return fetch(url, {
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

export function primeVocab(promptText: string, limit = 10): Promise<{ topic: string; vocab: Vocab[] }> {
  const params = new URLSearchParams({ promptText, limit: String(limit) });
  return apiFetch(`/api/vocab/prime?${params.toString()}`).then(readJson<{ topic: string; vocab: Vocab[] }>);
}

export function getVocabList(limit = 200): Promise<VocabListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch(`/api/vocab/list?${params.toString()}`).then(readJson<VocabListResponse>);
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

export function submitSession(payload: SessionSubmitPayload): Promise<{ id: number }> {
  return postJson<{ id: number }>('/api/sessions', payload);
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

export function getProgress(): Promise<ProgressResponse> {
  return apiFetch('/api/progress').then(readJson<ProgressResponse>);
}

export function getHistory(limit = 100): Promise<WritingHistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
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

export function revealSentenceLabResult(
  id: number,
  rewrite: string,
): Promise<SentenceLabResultResponse> {
  return postJson<SentenceLabResultResponse>('/api/sentence-lab/result', { id, rewrite });
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
