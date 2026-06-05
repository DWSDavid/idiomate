import React, { useEffect, useState } from 'react';
import type { ErrorTally, ErrorType, LessonResponse, LessonRule, MistakeLogItem, MistakeRankingItem } from '../../../shared/types';
import type { ProfileResponse } from '../api';
import { getLesson, getMistakes, getProfile } from '../api';

interface ProfileDashboardProps {
  refreshKey?: number;
}

function labelFor(errorType: ErrorType): string {
  return errorType.replace(/_/g, ' ');
}

function repairFrame(errorType: ErrorType): Array<{ label: string; text: string }> {
  if (errorType === 'tense') {
    return [
      { label: 'Time anchor', text: 'Find the word or idea that fixes time: yesterday, over time, now, before, next year.' },
      { label: 'Verb form', text: 'Choose the verb form that matches that anchor: past, present, future, or perfect.' },
      { label: 'Timeline consistency', text: 'Change tense only when the timeline actually moves.' },
    ];
  }
  if (errorType === 'sprawl') {
    return [
      { label: 'One claim', text: 'Keep one main claim per sentence.' },
      { label: 'Next sentence', text: 'Move the next idea into a new sentence with its own subject and verb.' },
      { label: 'Connection', text: 'Use the connector only after the relationship is clear.' },
    ];
  }
  return [
    { label: 'Locate', text: 'Find the exact phrase where the English reader has to work too hard.' },
    { label: 'Name', text: 'Name the pattern before rewriting, so the correction becomes repeatable.' },
    { label: 'Repair', text: 'Make the smallest structural move that changes the sentence.' },
  ];
}

function BookConnection({ rules }: { rules: LessonRule[] }) {
  const reference = rules.find(rule => rule.bookReference)?.bookReference;
  if (!reference) return null;

  return (
    <div className="lesson-card lesson-card-accent">
      <p className="lesson-heading">Book connection</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{reference.source}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{reference.pattern}</p>
      {reference.quote ? (
        <blockquote className="mt-3 border-l-2 border-indigo-300 pl-3 text-sm leading-6 text-slate-700">
          {reference.quote}
        </blockquote>
      ) : reference.quoteStatus ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{reference.quoteStatus}</p>
      ) : null}
      {reference.exampleBefore && reference.exampleAfter ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <p className="rounded-lg bg-white/70 p-2 text-slate-500">{reference.exampleBefore}</p>
          <p className="rounded-lg bg-white/70 p-2 font-medium text-slate-900">{reference.exampleAfter}</p>
        </div>
      ) : null}
    </div>
  );
}

function LessonPanel({ errorType, lesson }: { errorType: ErrorType; lesson: LessonResponse }) {
  const frames = repairFrame(errorType);

  return (
    <div className="lesson-panel">
      <div className="lesson-card">
        <p className="lesson-heading">What is the pattern?</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{lesson.principle}</p>
      </div>

      <div className="lesson-card">
        <p className="lesson-heading">Why it feels unnatural</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">{lesson.mindset}</p>
      </div>

      <div className="lesson-card">
        <p className="lesson-heading">How to repair it</p>
        <div className="mt-3 grid gap-2">
          {frames.map(frame => (
            <div key={frame.label} className="repair-step">
              <span className="repair-label">{frame.label}</span>
              <span className="text-slate-600">{frame.text}</span>
            </div>
          ))}
        </div>
        {lesson.rules.length ? (
          <div className="mt-3 space-y-2">
            {lesson.rules.map(rule => (
              <div key={rule.name} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{rule.principle}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <BookConnection rules={lesson.rules} />

      <div className="lesson-card">
        <p className="lesson-heading">Your sentence history</p>
        <div className="mt-3 space-y-3">
          {lesson.pastInstances.map(instance => (
            <div key={`${instance.date}-${instance.span}`} className="sentence-pair">
              <p className="text-slate-500">{instance.span}</p>
              {instance.userRewrite ? <p className="font-medium text-slate-900">{instance.userRewrite}</p> : null}
              {instance.rule ? <p className="text-xs text-slate-400">{instance.rule}</p> : null}
            </div>
          ))}
          {!lesson.pastInstances.length ? <p className="text-sm text-slate-500">No stored examples yet.</p> : null}
        </div>
      </div>

      <div className="lesson-card">
        <p className="lesson-heading">Practice pairs</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          <span>Before</span>
          <span>After</span>
        </div>
        <div className="mt-2 space-y-2">
          {lesson.comparisonPairs.map(pair => (
            <div key={`${pair.before}-${pair.after}`} className="grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-lg bg-rose-50/70 p-3 text-slate-600">{pair.before}</p>
              <div className="rounded-lg bg-emerald-50/70 p-3">
                <p className="font-medium text-slate-950">{pair.after}</p>
                {pair.note ? <p className="mt-1 text-xs text-slate-500">{pair.note}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfileDashboard({ refreshKey = 0 }: ProfileDashboardProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [expanded, setExpanded] = useState<ErrorType | null>(null);
  const [lessonOpen, setLessonOpen] = useState<ErrorType | null>(null);
  const [mistakeLogs, setMistakeLogs] = useState<Partial<Record<ErrorType, MistakeLogItem[]>>>({});
  const [lessons, setLessons] = useState<Partial<Record<ErrorType, LessonResponse>>>({});
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [lessonStatus, setLessonStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getProfile()
      .then(result => {
        if (!alive) return;
        setProfile(result);
        setStatus('idle');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const openMistakes = async (errorType: ErrorType) => {
    const nextExpanded = expanded === errorType ? null : errorType;
    setExpanded(nextExpanded);
    if (!nextExpanded || mistakeLogs[errorType]) return;

    setLogStatus('loading');
    try {
      const result = await getMistakes(errorType);
      setMistakeLogs(current => ({ ...current, [errorType]: result.mistakes }));
      setLogStatus('idle');
    } catch {
      setLogStatus('error');
    }
  };

  const openLesson = async (errorType: ErrorType) => {
    const nextOpen = lessonOpen === errorType ? null : errorType;
    setLessonOpen(nextOpen);
    if (!nextOpen || lessons[errorType]) return;

    setLessonStatus('loading');
    try {
      const result = await getLesson(errorType);
      setLessons(current => ({ ...current, [errorType]: result }));
      setLessonStatus('idle');
    } catch {
      setLessonStatus('error');
    }
  };

  const suggested = profile?.activation.suggested ?? 0;
  const used = profile?.activation.used ?? 0;
  const ratio = suggested ? Math.round((used / suggested) * 100) : 0;
  const rankedMistakes = profile?.ranking?.length
    ? profile.ranking
    : (profile?.tallies ?? []).map((tally: ErrorTally): MistakeRankingItem => ({
        errorType: tally.errorType,
        count: tally.count,
        lastSeen: tally.lastSeen,
        recentExamples: [],
      }));
  const maxCount = Math.max(...rankedMistakes.map(item => item.count), 1);

  return (
    <section className="surface" aria-label="profile">
      <span className="section-label">Your patterns</span>

      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load your profile.</p> : null}

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-sky-50 p-4">
          <p className="text-xs font-medium text-slate-500">Vocab activation</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-slate-950">{ratio}%</p>
          <p className="mt-1 text-sm text-slate-500">{used} of {suggested} used</p>
        </div>

        <div className="space-y-4">
          {rankedMistakes.slice(0, 6).map(item => (
            <div key={item.errorType} className="mistake-row">
              <button
                type="button"
                className="w-full text-left"
                aria-label={`Open ${labelFor(item.errorType)} mistakes`}
                onClick={() => void openMistakes(item.errorType)}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800">{labelFor(item.errorType)}</span>
                  <span className="tabular-nums text-slate-400">{item.count}</span>
                </div>
              </button>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(8, (item.count / maxCount) * 100)}%` }} />
              </div>
              {item.recentExamples.length ? (
                <div className="mt-3 space-y-2 text-xs text-slate-500">
                  {item.recentExamples.map(example => (
                    <div key={`${item.errorType}-${example.date}-${example.span}`} className="recent-example-card">
                      <p className="font-medium text-slate-700">{example.span}</p>
                      {example.userRewrite ? <p className="mt-1">Rewrote as: {example.userRewrite}</p> : null}
                      {example.rule ? <p className="mt-1 text-slate-400">{example.rule}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => void openLesson(item.errorType)}
                >
                  Learn {labelFor(item.errorType)}
                </button>
              </div>
              {expanded === item.errorType ? (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">Where it happened</p>
                  {logStatus === 'loading' ? <p>Loading examples.</p> : null}
                  {logStatus === 'error' ? <p className="text-red-700">Could not load examples.</p> : null}
                  {(mistakeLogs[item.errorType] ?? []).map(example => (
                    <div key={`${item.errorType}-${example.date}-${example.span}`} className="space-y-1">
                      <p>
                        <span className="font-medium text-slate-900">{example.span}</span>
                        {example.date ? <span className="text-slate-400"> - {example.date}</span> : null}
                      </p>
                      {example.userRewrite ? <p>Rewrite: {example.userRewrite}</p> : null}
                      {example.rule ? <p>Rule: {example.rule}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {lessonOpen === item.errorType ? (
                <div className="mt-3">
                  {lessonStatus === 'loading' ? <p className="text-sm text-slate-500">Loading lesson.</p> : null}
                  {lessonStatus === 'error' ? <p className="text-sm text-red-700">Could not load lesson.</p> : null}
                  {lessons[item.errorType] ? (
                    <LessonPanel errorType={item.errorType} lesson={lessons[item.errorType]!} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {profile && !rankedMistakes.length ? (
            <p className="text-sm leading-6 text-slate-500">No submitted rewrites yet. Coach a paragraph and submit your rewrite to start your profile.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
