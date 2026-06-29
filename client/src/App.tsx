import React, { useEffect, useState } from 'react';
import type { CoachResponse, Prompt } from '../../shared/types';
import { ACCESS_DENIED_EVENT, coach, getProgress, recordCoachDiagnosis, saveAccessCode, submitSession as postSession } from './api';
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
import { DailyDashboard } from './components/DailyDashboard';
import { GraduatedShelf } from './components/GraduatedShelf';
import { SentenceLab } from './components/SentenceLab';
import { SentencePatterns } from './components/SentencePatterns';
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

type WorkspaceSection = 'write' | 'lab' | 'words' | 'review' | 'me' | 'patterns' | 'admin';

const workspaceSections: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'write', label: 'Write' },
  { id: 'lab', label: 'Lab' },
  { id: 'words', label: 'Words' },
  { id: 'review', label: 'Review' },
  { id: 'me', label: 'Me' },
  { id: 'patterns', label: 'Patterns' },
];

export function App() {
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [accessRetryKey, setAccessRetryKey] = useState(0);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [draft, setDraft] = useState('');
  const [coachingIndex, setCoachingIndex] = useState<number | undefined>();
  const [coachPanels, setCoachPanels] = useState<CoachPanelState[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [primedVocab, setPrimedVocab] = useState<string[]>([]);
  const [saveResult, setSaveResult] = useState<{ vocabUsed: number; vocabTotal: number } | null>(null);
  const [profileKey, setProfileKey] = useState(0);
  const [vocabKey, setVocabKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('write');
  const [writingSource, setWritingSource] = useState<'daily_writing' | 'free_writing'>('daily_writing');

  useEffect(() => {
    const onAccessDenied = () => setAccessBlocked(true);
    globalThis.addEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
    return () => globalThis.removeEventListener?.(ACCESS_DENIED_EVENT, onAccessDenied);
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seenKey = `idiomate-dashboard-seen-${today}`;
    getProgress().then(data => {
      setStreakCount(data.streak?.currentStreak ?? 0);
      if (!sessionStorage.getItem(seenKey)) {
        sessionStorage.setItem(seenKey, '1');
        setDashboardOpen(true);
      }
    }).catch(() => undefined);
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
    setSaveResult(null);
    try {
      const result = await postSession({
        date: prompt?.date,
        promptId: prompt?.id,
        draftText: draft,
        finalText: draft,
        primedVocab: primedVocab.length ? primedVocab : undefined,
        source: writingSource,
      });
      setSessionStatus('saved');
      if (primedVocab.length) {
        setSaveResult({ vocabUsed: result.vocabUsed, vocabTotal: result.vocabTotal });
      }
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
            <h1 className="desk-title flex items-center gap-2">
              <img src="/logo-icon.png" alt="" aria-hidden="true" className="h-12 w-auto" />
              Idiomate
            </h1>
            <p className="desk-subtitle">Draft, revise, learn the pattern, then activate the words you keep meeting.</p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 transition-colors"
              onClick={() => setDashboardOpen(true)}
              title="View your streak and writing calendar"
            >
              <span>{streakCount > 0 ? '🔥' : '✏️'}</span>
              <span>{streakCount} {streakCount === 1 ? 'day' : 'days'}</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!draft.trim() || sessionStatus === 'saving'}
              onClick={handleSubmitSession}
            >
              {sessionStatus === 'saving' ? 'Saving' : 'Save session'}
            </button>
          </div>
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
            <VocabPrime promptText={prompt?.text ?? ''} refreshKey={vocabKey} onVocabChange={setPrimedVocab} />
          </aside>

          <div className="draft-workbench" aria-label="draft workbench">
            {sessionStatus === 'saved' ? (
              <p className="notice notice-success">
                {saveResult
                  ? `Saved. You used ${saveResult.vocabUsed} of ${saveResult.vocabTotal} primed words.`
                  : 'Session saved. Your profile is updated.'}
              </p>
            ) : null}
            {sessionStatus === 'error' ? (
              <p className="notice notice-error">Could not save the session.</p>
            ) : null}

            <WriteSurface
              value={draft}
              onChange={setDraft}
              onCoachParagraph={handleCoachParagraph}
              coachingIndex={coachingIndex}
              onSourceChange={setWritingSource}
            />

            {coachPanels.map(item => (
              <CoachPanel
                key={item.id}
                paragraph={item.paragraph}
                nativeVersion={item.response.nativeVersion}
                elevatedVersion={item.response.elevatedVersion}
                elevationNotes={item.response.elevationNotes}
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

        <section className={`workspace-page${activeSection === 'lab' ? '' : ' hidden'}`} aria-label="sentence lab">
          <SentenceLab onRecorded={() => { setProfileKey(key => key + 1); setHistoryKey(key => key + 1); }} />
        </section>

        <section className={`workspace-page two-column-page${activeSection === 'words' ? '' : ' hidden'}`} aria-label="vocabulary">
          <OwnerVocabImport onImported={handleVocabSaved} />
          <ChineseToVocabBox onSaved={handleVocabSaved} />
          <CaptureWord onSaved={handleVocabSaved} />
          <VocabularyPanel refreshKey={vocabKey + profileKey} />
          <GraduatedShelf />
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

        <section className={`workspace-page${activeSection === 'patterns' ? '' : ' hidden'}`} aria-label="sentence patterns">
          <SentencePatterns />
        </section>

        {activeSection === 'admin' ? (
          <section className="workspace-page" aria-label="admin">
            <AdminPanel />
          </section>
        ) : null}

        <footer className="pb-2 text-center text-xs text-slate-400">Local-first. Your words stay on your machine.</footer>
      </div>

      <DailyDashboard open={dashboardOpen} onClose={() => setDashboardOpen(false)} />
    </main>
  );
}
