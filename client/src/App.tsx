import React, { useEffect, useState } from 'react';
import type { CoachResponse, Prompt } from '../../shared/types';
import { ACCESS_DENIED_EVENT, coach, saveAccessCode, submitSession as postSession } from './api';
import { AccessGate } from './components/AccessGate';
import { CoachPanel } from './components/CoachPanel';
import type { ComparedAnnotation } from './components/CompareView';
import { CaptureWord } from './components/CaptureWord';
import { DailyPrompt } from './components/DailyPrompt';
import { ProfileDashboard } from './components/ProfileDashboard';
import { ProgressPanel } from './components/ProgressPanel';
import { SentenceLab } from './components/SentenceLab';
import { VocabPrime } from './components/VocabPrime';
import { VocabularyPanel } from './components/VocabularyPanel';
import { WriteSurface } from './components/WriteSurface';

interface CoachPanelState {
  paragraph: string;
  response: CoachResponse;
}

export function App() {
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [accessRetryKey, setAccessRetryKey] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [draft, setDraft] = useState('');
  const [coachingIndex, setCoachingIndex] = useState<number | undefined>();
  const [coachPanels, setCoachPanels] = useState<Record<number, CoachPanelState>>({});
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileKey, setProfileKey] = useState(0);
  const [vocabKey, setVocabKey] = useState(0);

  useEffect(() => {
    const onAccessDenied = () => setAccessBlocked(true);
    globalThis.addEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
    return () => globalThis.removeEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
  }, []);

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

  if (accessBlocked) {
    return (
      <AccessGate
        onSubmit={code => {
          saveAccessCode(code);
          setAccessBlocked(false);
          setAccessRetryKey(key => key + 1);
        }}
      />
    );
  }

  return (
    <main className="app-shell min-h-[100dvh] overflow-x-hidden text-slate-950">
      <div key={accessRetryKey} className="mx-auto flex min-w-0 max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header
          className="desk-header"
          aria-label="Writing desk header"
          role="banner"
        >
          <div>
            <p className="desk-kicker">Editorial writing desk</p>
            <h1 className="desk-title">Idiomate</h1>
            <p className="desk-subtitle">Draft, revise, learn the pattern, then activate the words you keep meeting.</p>
          </div>
          <button
            type="button"
            className="btn-primary self-start sm:self-auto"
            disabled={!draft.trim() || sessionStatus === 'saving'}
            onClick={handleSubmitSession}
          >
            {sessionStatus === 'saving' ? 'Saving' : 'Save session'}
          </button>
        </header>

        <div className="desk-grid">
          <aside className="desk-rail desk-rail-left" aria-label="daily desk">
            <DailyPrompt onPrompt={setPrompt} />
            <ProfileDashboard refreshKey={profileKey} />
            <ProgressPanel refreshKey={profileKey} />
          </aside>

          <section className="desk-center" aria-label="writing canvas">
            {sessionStatus === 'saved' ? (
              <p className="notice notice-success">Session saved. Your profile is updated.</p>
            ) : null}
            {sessionStatus === 'error' ? (
              <p className="notice notice-error">Could not save the session.</p>
            ) : null}

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
          </section>

          <aside className="desk-rail desk-rail-right" aria-label="companion rail">
            <SentenceLab onRecorded={() => setProfileKey(key => key + 1)} />
            <VocabPrime promptText={prompt?.text ?? ''} refreshKey={vocabKey} />
            <CaptureWord onSaved={() => setVocabKey(key => key + 1)} />
            <VocabularyPanel refreshKey={vocabKey + profileKey} />
          </aside>
        </div>

        <footer className="pb-2 text-center text-xs text-slate-400">Local-first. Your words stay on your machine.</footer>
      </div>
    </main>
  );
}
