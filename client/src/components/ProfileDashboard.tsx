import React, { useEffect, useState } from 'react';
import type { ProfileResponse } from '../api';
import { getProfile } from '../api';

export function ProfileDashboard() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getProfile()
      .then(result => {
        if (!alive) return;
        setProfile(result);
        setStatus('idle');
      })
      .catch(() => {
        if (!alive) return;
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const suggested = profile?.activation.suggested ?? 0;
  const used = profile?.activation.used ?? 0;
  const ratio = suggested ? Math.round((used / suggested) * 100) : 0;
  const maxCount = Math.max(...(profile?.tallies.map(tally => tally.count) ?? [1]), 1);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-label="profile">
      <h2 className="text-lg font-semibold text-zinc-950">Profile</h2>

      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load profile.</p> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_12rem]">
        <div className="space-y-3">
          {(profile?.tallies ?? []).slice(0, 5).map(tally => (
            <div key={tally.errorType}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-800">{tally.errorType}</span>
                <span className="text-zinc-500">{tally.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-zinc-100">
                <div className="h-full bg-emerald-600" style={{ width: `${Math.max(8, (tally.count / maxCount) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">{tally.lastSeen}</p>
            </div>
          ))}
          {profile && !profile.tallies.length ? <p className="text-sm text-zinc-500">No submitted sessions yet.</p> : null}
        </div>

        <div className="rounded-md border border-zinc-200 p-4">
          <p className="text-sm font-medium text-zinc-700">Vocab Activation</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-950">{ratio}%</p>
          <p className="mt-2 text-sm text-zinc-500">{used}/{suggested} used</p>
        </div>
      </div>
    </section>
  );
}
