import React, { useState } from 'react';
import type { CoachResponse, Prompt } from '../../shared/types';
import { coach, submitSession as postSession, type SubmittedAnnotation } from './api';
import { CoachPanel } from './components/CoachPanel';
import type { ComparedAnnotation } from './components/CompareView';
import { DailyPrompt } from './components/DailyPrompt';
import { ProfileDashboard } from './components/ProfileDashboard';
import { VocabPrime } from './components/VocabPrime';
import { WriteSurface } from './components/WriteSurface';

interface CoachPanelState {
  paragraph: string;
  response: CoachResponse;
}

export function App() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [draft, setDraft] = useState('');
  const [coachingIndex, setCoachingIndex] = useState<number | undefined>();
  const [coachPanels, setCoachPanels] = useState<Record<number, CoachPanelState>>({});
  const [submittedAnnotations, setSubmittedAnnotations] = useState<SubmittedAnnotation[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleCoachParagraph = async (paragraph: string, paragraphIndex: number) => {
    setCoachingIndex(paragraphIndex);
    try {
      const response = await coach(paragraph, paragraphIndex);
      setCoachPanels(current => ({
        ...current,
        [paragraphIndex]: { paragraph, response },
      }));
    } finally {
      setCoachingIndex(undefined);
    }
  };

  const handleCoachSubmit = (paragraphIndex: number) => (rewrite: string, accepted: ComparedAnnotation[]) => {
    const next = accepted.map(annotation => ({
      ...annotation,
      paragraphIdx: paragraphIndex,
      userRewrite: rewrite,
    }));
    setSubmittedAnnotations(current => [
      ...current.filter(annotation => annotation.paragraphIdx !== paragraphIndex),
      ...next,
    ]);
  };

  const handleSubmitSession = async () => {
    if (!draft.trim()) return;
    setSessionStatus('saving');
    try {
      await postSession({
        date: prompt?.date,
        promptId: prompt?.id,
        draftText: draft,
        finalText: draft,
        annotations: submittedAnnotations,
      });
      setSessionStatus('saved');
    } catch {
      setSessionStatus('error');
    }
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">Idiomate</h1>
            <p className="mt-1 text-sm text-zinc-600">Local writing coach</p>
          </div>
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
            disabled={!draft.trim() || sessionStatus === 'saving'}
            onClick={handleSubmitSession}
          >
            {sessionStatus === 'saving' ? 'Saving...' : 'Save Session'}
          </button>
        </header>

        <DailyPrompt onPrompt={setPrompt} />
        <VocabPrime topic={prompt?.theme ?? ''} />
        <WriteSurface
          value={draft}
          onChange={setDraft}
          onCoachParagraph={handleCoachParagraph}
          coachingIndex={coachingIndex}
        />

        {Object.entries(coachPanels).map(([paragraphIndex, item]) => (
          <CoachPanel
            key={paragraphIndex}
            paragraph={item.paragraph}
            annotations={item.response.annotations}
            onSubmit={handleCoachSubmit(Number(paragraphIndex))}
          />
        ))}

        {sessionStatus === 'saved' ? <p className="text-sm text-emerald-700">Session saved.</p> : null}
        {sessionStatus === 'error' ? <p className="text-sm text-red-700">Could not save session.</p> : null}

        <ProfileDashboard />
      </div>
    </main>
  );
}
