import React, { useEffect, useState } from 'react';
import type { ErrorTally, ErrorType, MistakeLogItem, MistakeRankingItem } from '../../../shared/types';
import type { ProfileResponse } from '../api';
import { getMistakes, getProfile } from '../api';

interface ProfileDashboardProps {
  refreshKey?: number;
}

export function ProfileDashboard({ refreshKey = 0 }: ProfileDashboardProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [expanded, setExpanded] = useState<ErrorType | null>(null);
  const [mistakeLogs, setMistakeLogs] = useState<Partial<Record<ErrorType, MistakeLogItem[]>>>({});
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'error'>('idle');

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

      <div className="mt-4 grid gap-5 md:grid-cols-[1fr_11rem]">
        <div className="space-y-3">
          {rankedMistakes.slice(0, 6).map(item => (
            <div key={item.errorType} className="space-y-2">
              <button
                type="button"
                className="w-full text-left"
                aria-label={`Open ${item.errorType.replace(/_/g, ' ')} mistakes`}
                onClick={() => void openMistakes(item.errorType)}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-stone-700">{item.errorType.replace(/_/g, ' ')}</span>
                  <span className="text-stone-400">{item.count}</span>
                </div>
              </button>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(8, (item.count / maxCount) * 100)}%` }} />
              </div>
              {item.recentExamples.length ? (
                <div className="space-y-1 border-l border-stone-200 pl-3 text-xs text-stone-500">
                  {item.recentExamples.map(example => (
                    <p key={`${item.errorType}-${example.date}-${example.span}`}>
                      <span className="font-medium text-stone-700">{example.span}</span>
                      {example.userRewrite ? <span> to {example.userRewrite}</span> : null}
                      {example.rule ? <span> · {example.rule}</span> : null}
                    </p>
                  ))}
                </div>
              ) : null}
              {expanded === item.errorType ? (
                <div className="space-y-2 rounded-lg border border-stone-200 p-3 text-xs text-stone-600">
                  <p className="font-medium text-stone-700">Where it happened</p>
                  {logStatus === 'loading' ? <p>Loading examples.</p> : null}
                  {logStatus === 'error' ? <p className="text-red-700">Could not load examples.</p> : null}
                  {(mistakeLogs[item.errorType] ?? []).map(example => (
                    <div key={`${item.errorType}-${example.date}-${example.span}`} className="space-y-1">
                      <p>
                        <span className="font-medium text-stone-900">{example.span}</span>
                        {example.date ? <span className="text-stone-400"> · {example.date}</span> : null}
                      </p>
                      {example.userRewrite ? <p>Rewrite: {example.userRewrite}</p> : null}
                      {example.rule ? <p>Rule: {example.rule}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {profile && !rankedMistakes.length ? (
            <p className="text-sm text-stone-500">No submitted rewrites yet. Coach a paragraph and submit your rewrite to start your profile.</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-medium text-stone-500">Vocab activation</p>
          <p className="mt-2 font-serif text-4xl font-semibold text-stone-900">{ratio}%</p>
          <p className="mt-1 text-sm text-stone-400">{used} of {suggested} used</p>
        </div>
      </div>
    </section>
  );
}
