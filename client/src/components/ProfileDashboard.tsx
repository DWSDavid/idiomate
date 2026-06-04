import React, { useEffect, useState } from 'react';
import type { ProfileResponse } from '../api';
import { getProfile } from '../api';

interface ProfileDashboardProps {
  refreshKey?: number;
}

export function ProfileDashboard({ refreshKey = 0 }: ProfileDashboardProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

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

  const suggested = profile?.activation.suggested ?? 0;
  const used = profile?.activation.used ?? 0;
  const ratio = suggested ? Math.round((used / suggested) * 100) : 0;
  const maxCount = Math.max(...(profile?.tallies.map(tally => tally.count) ?? [1]), 1);

  return (
    <section className="surface" aria-label="profile">
      <span className="section-label">Your patterns</span>

      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load your profile.</p> : null}

      <div className="mt-4 grid gap-5 md:grid-cols-[1fr_11rem]">
        <div className="space-y-3">
          {(profile?.tallies ?? []).slice(0, 6).map(tally => (
            <div key={tally.errorType}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-stone-700">{tally.errorType.replace(/_/g, ' ')}</span>
                <span className="text-stone-400">{tally.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(8, (tally.count / maxCount) * 100)}%` }} />
              </div>
            </div>
          ))}
          {profile && !profile.tallies.length ? (
            <p className="text-sm text-stone-500">No submitted sessions yet. Coach a paragraph and save to start your profile.</p>
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
