import React, { useState } from 'react';
import type { CoachResponse, Prompt } from '../../shared/types';
import { coach, submitSession as postSession } from './api';
import { CoachPanel } from './components/CoachPanel';
import type { ComparedAnnotation } from './components/CompareView';
import { CaptureWord } from './components/CaptureWord';
import { DailyPrompt } from './components/DailyPrompt';
import { ProfileDashboard } from './components/ProfileDashboard';
import { ProgressPanel } from './components/ProgressPanel';
import { VocabPrime } from './components/VocabPrime';
import { VocabularyPanel } from './components/VocabularyPanel';
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
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileKey, setProfileKey] = useState(0);
  const [vocabKey, setVocabKey] = useState(0);

  const handleCoachParagraph = async (paragraph: string, paragraphIndex: number) => {
    setCoachingIndex(paragraphIndex);
    try {
      const response = await coach(paragraph, paragraphIndex);
      setCoachPanels(current => ({ ...current, [paragraphIndex]: { paragraph, response } }));
    } finally {
      setCoachingIndex(undefined);
    }
  };

  const handleCoachSubmit = (_paragraphIndex: number) => (_rewrite: string, _accepted: ComparedAnnotation[]) => {};

  const handleSubmitSession = async () => {
    if (!draft.trim()) return;
    setSessionStatus('saving');
    try {
      await postSession({
        date: prompt?.date,
        promptId: prompt?.id,
        draftText: draft,
        finalText: draft,
      });
      setSessionStatus('saved');
      setProfileKey(key => key + 1); // refetch profile so tallies + activation update after submit
    } catch {
      setSessionStatus('error');
    }
  };

  return (
    <main className="min-h-[100dvh] bg-stone-50 text-stone-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10 md:py-14">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">Idiomate</h1>
            <p className="mt-1 text-sm text-stone-500">A quiet coach for writing like a native.</p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!draft.trim() || sessionStatus === 'saving'}
            onClick={handleSubmitSession}
          >
            {sessionStatus === 'saving' ? 'Saving' : 'Save session'}
          </button>
        </header>

        {sessionStatus === 'saved' ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Session saved. Your profile below is updated.
          </p>
        ) : null}
        {sessionStatus === 'error' ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            Could not save the session.
          </p>
        ) : null}

        <DailyPrompt onPrompt={setPrompt} />
        <VocabPrime promptText={prompt?.text ?? ''} refreshKey={vocabKey} />
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
            nativeVersion={item.response.nativeVersion}
            annotations={item.response.annotations}
            recordContext={{
              date: prompt?.date,
              promptId: prompt?.id,
              paragraphIdx: Number(paragraphIndex),
            }}
            onRecorded={() => setProfileKey(key => key + 1)}
            onSubmit={handleCoachSubmit(Number(paragraphIndex))}
          />
        ))}

        <ProfileDashboard refreshKey={profileKey} />
        <ProgressPanel refreshKey={profileKey} />
        <CaptureWord onSaved={() => setVocabKey(key => key + 1)} />
        <VocabularyPanel refreshKey={vocabKey + profileKey} />

        <footer className="pb-2 text-center text-xs text-stone-400">Local-first. Your words stay on your machine.</footer>
      </div>
    </main>
  );
}
