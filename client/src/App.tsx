import React, { useEffect, useState } from 'react';
import type { CoachResponse, Prompt } from '../../shared/types';
import { ACCESS_DENIED_EVENT, coach, recordCoachDiagnosis, saveAccessCode, submitSession as postSession } from './api';
import { AccessGate } from './components/AccessGate';
import { AdminPanel } from './components/AdminPanel';
import { CoachPanel } from './components/CoachPanel';
import type { ComparedAnnotation } from './components/CompareView';
import { CaptureWord } from './components/CaptureWord';
import { ChineseToVocabBox } from './components/ChineseToVocabBox';
import { DailyPrompt } from './components/DailyPrompt';
import { HistoryPanel } from './components/HistoryPanel';
import { OwnerVocabImport } from './components/OwnerVocabImport';
import { MemoryProfileCard } from './components/MemoryProfileCard';
import { ProfileDashboard } from './components/ProfileDashboard';
import { ProgressPanel } from './components/ProgressPanel';
import { ReviewPanel } from './components/ReviewPanel';
import { TodayStrip } from './components/TodayStrip';
import { VocabPrime } from './components/VocabPrime';
import { VocabularyPanel } from './components/VocabularyPanel';
import { WriteSurface } from './components/WriteSurface';

interface CoachPanelState {
  id: string;
  paragraphIndex: number;
  paragraph: string;
  response: CoachResponse;
}

type WorkspaceSection = 'write' | 'words' | 'review' | 'me' | 'admin';

const workspaceSections: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'words', label: 'Words' },
  { id: 'review', label: 'Review' },
  { id: 'me', label: 'Me' },
];

export function App() {
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [accessRetryKey, setAccessRetryKey] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [draft, setDraft] = useState('');
  const [coachingIndex, setCoachingIndex] = useState<number | undefined>();
  const [coachPanels, setCoachPanels] = useState<CoachPanelState[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileKey, setProfileKey] = useState(0);
  const [vocabKey, setVocabKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('write');

  useEffect(() => {
    const onAccessDenied = () => setAccessBlocked(true);
    globalThis.addEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
    return () => globalThis.removeEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
  }, []);

  const handleCoachParagraph = async (paragraph: string, paragraphIndex: number) => {
    setCoachingIndex(paragraphIndex);
    try {
      const response = await coach(paragraph, paragraphIndex);
      setCoachPanels(current => [
        {
          id: `${paragraphIndex}-${Date.now()}-${current.length}`,
          paragraphIndex,
          paragraph,
          response,
        },
        ...current,
      ]);
      void recordCoachDiagnosis({
        date: prompt?.date,
        promptId: prompt?.id,
        paragraphIdx: paragraphIndex,
        paragraph,
        annotations: response.annotations,
      }).then(() => setHistoryKey(key => key + 1)).catch(() => undefined);
    } finally {
      setCoachingIndex(undefined);
    }
  };

  const handleCoachSubmit = (_paragraphIndex: number) => (_rewrite: string, _accepted: ComparedAnnotation[]) => {};

  const handleVocabSaved = () => {
    setVocabKey(key => key + 1);
    setProfileKey(key => key + 1);
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
      });
      setSessionStatus('saved');
      setProfileKey(key => key + 1); // refetch profile so tallies + activation update after submit
      setHistoryKey(key => key + 1);
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

        <nav className="workspace-tabs" aria-label="Workspace sections">
          {workspaceSections.map(section => (
            <button
              key={section.id}
              type="button"
              className="workspace-tab"
              aria-pressed={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <section className={`writing-workbench workspace-page${activeSection === 'write' ? '' : ' hidden'}`} aria-label="writing canvas">
          <aside className="writing-reference-rail" aria-label="writing reference rail">
            <TodayStrip refreshKey={vocabKey} />
            <DailyPrompt onPrompt={setPrompt} />
            <VocabPrime promptText={prompt?.text ?? ''} refreshKey={vocabKey} />
          </aside>

          <div className="draft-workbench" aria-label="draft workbench">
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

            {coachPanels.map(item => (
              <CoachPanel
                key={item.id}
                paragraph={item.paragraph}
                nativeVersion={item.response.nativeVersion}
                annotations={item.response.annotations}
                recordContext={{
                  date: prompt?.date,
                  promptId: prompt?.id,
                  paragraphIdx: item.paragraphIndex,
                }}
                onRecorded={() => setProfileKey(key => key + 1)}
                onSubmit={handleCoachSubmit(item.paragraphIndex)}
              />
            ))}
          </div>
        </section>

        <section className={`workspace-page two-column-page${activeSection === 'words' ? '' : ' hidden'}`} aria-label="vocabulary">
          <OwnerVocabImport onImported={handleVocabSaved} />
          <ChineseToVocabBox onSaved={handleVocabSaved} />
          <CaptureWord onSaved={handleVocabSaved} />
          <VocabularyPanel refreshKey={vocabKey + profileKey} />
        </section>

        <section className={`workspace-page${activeSection === 'review' ? '' : ' hidden'}`} aria-label="review">
          <ReviewPanel onGoWrite={() => setActiveSection('write')} />
        </section>

        <section className={`workspace-page two-column-page${activeSection === 'me' ? '' : ' hidden'}`} aria-label="me">
          <ProfileDashboard refreshKey={profileKey} />
          <ProgressPanel refreshKey={profileKey} />
          <MemoryProfileCard />
          <HistoryPanel refreshKey={historyKey} />
        </section>

        {activeSection === 'admin' ? (
          <section className="workspace-page" aria-label="admin">
            <AdminPanel />
          </section>
        ) : null}

        <footer className="pb-2 text-center text-xs text-slate-400">Local-first. Your words stay on your machine.</footer>
      </div>
    </main>
  );
}
