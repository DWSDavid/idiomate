import React, { useEffect, useState } from 'react';
import type { ProgressResponse } from '../../../shared/types';
import { getProgress } from '../api';

interface ProgressPanelProps {
  refreshKey?: number;
}

export function ProgressPanel({ refreshKey = 0 }: ProgressPanelProps) {
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    getProgress()
      .then(result => {
        if (!alive) return;
        setProgress(result);
        setStatus('idle');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const daily = progress?.daily ?? [];
  const trend = progress?.trend ?? [];
  const maxDaily = Math.max(...daily.map(point => point.count), 1);

  return (
    <section className="surface" aria-label="progress">
      <span className="section-label">Progress</span>
      {status === 'error' ? <p className="mt-4 text-sm text-red-700">Could not load progress.</p> : null}

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-stone-700">Daily mistakes</p>
          <div className="mt-3 space-y-2">
            {daily.map(point => (
              <div key={point.date} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-stone-600">{point.date}</span>
                  <span className="text-stone-400">{point.count} {point.count === 1 ? 'issue' : 'issues'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(8, (point.count / maxDaily) * 100)}%` }} />
                </div>
              </div>
            ))}
            {status === 'loading' ? <p className="text-sm text-stone-500">Loading progress.</p> : null}
            {status === 'idle' && !daily.length ? <p className="text-sm text-stone-500">No progress yet.</p> : null}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-stone-700">Top mistake trend</p>
          <div className="mt-3 space-y-3">
            {trend.map(series => (
              <div key={series.errorType} className="rounded-lg border border-stone-200 p-3">
                <p className="text-sm font-medium text-stone-900">{series.errorType.replace(/_/g, ' ')}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                  {series.points.map(point => (
                    <span key={`${series.errorType}-${point.date}`} className="chip">
                      {point.date}: {point.count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {status === 'idle' && !trend.length ? <p className="text-sm text-stone-500">No trend data yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
