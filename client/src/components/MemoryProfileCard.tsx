import React, { useEffect, useState } from 'react';
import { getMemoryProfile, type MemoryProfileResponse } from '../api';

type MemoryStatus = 'loading' | 'loaded' | 'error';

function labelErrorType(errorType: string): string {
  const spaced = errorType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function MemoryProfileCard() {
  const [status, setStatus] = useState<MemoryStatus>('loading');
  const [profile, setProfile] = useState<MemoryProfileResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getMemoryProfile()
      .then(result => {
        if (!alive) return;
        setProfile(result);
        setStatus('loaded');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const topWeaknesses = profile?.topWeaknesses ?? [];
  const vocabByEase = profile?.vocabByEase ?? { new: 0, hard: 0, easy: 0 };
  const isEmpty = status === 'loaded'
    && topWeaknesses.length === 0
    && (profile?.totalSessions ?? 0) === 0
    && (profile?.vocabCount ?? 0) === 0;

  return (
    <section className="surface" aria-label="memory profile">
      <span className="section-label">What I know about you</span>
      {status === 'loading' ? <p className="mt-4 text-sm text-stone-500">Loading...</p> : null}
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load memory profile.</p> : null}
      {isEmpty ? (
        <p className="mt-4 text-sm leading-6 text-stone-500">Write a few sessions and I will start building your profile.</p>
      ) : null}
      {status === 'loaded' && !isEmpty && profile ? (
        <div className="mt-4 space-y-4">
          {topWeaknesses.length ? (
            <div className="flex flex-wrap gap-2">
              {topWeaknesses.slice(0, 3).map(item => (
                <span key={item.errorType} className="chip chip-blue">{labelErrorType(item.errorType)}</span>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-slate-600">{profile.sessionEmbeddingsCount} of {profile.totalSessions} sessions analyzed.</p>
          <p className="text-sm text-slate-600">
            {profile.vocabCount} words - {vocabByEase.new} new - {vocabByEase.hard} to revisit - {vocabByEase.easy} confident
          </p>
        </div>
      ) : null}
    </section>
  );
}
