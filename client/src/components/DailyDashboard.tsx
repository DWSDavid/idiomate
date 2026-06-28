import React, { useEffect, useState } from 'react';
import type { StreakInfo } from '../../../shared/types';
import { getProgress } from '../api';
import { CalendarHeatmap } from './CalendarHeatmap';

interface DailyDashboardProps {
  open: boolean;
  onClose: () => void;
}

function streakMessage(streak: number): string {
  if (streak === 0) return 'Start your streak today — write something!';
  if (streak === 1) return 'Day 1. Every expert was once a beginner.';
  if (streak < 5) return `${streak} days in a row. You\'re building a habit.`;
  if (streak < 10) return `${streak}-day streak! Your writing is getting sharper.`;
  if (streak < 30) return `${streak} days strong. This is real progress.`;
  return `${streak} days. Remarkable consistency.`;
}

function streakEmoji(streak: number): string {
  if (streak === 0) return '✏️';
  if (streak < 5) return '🔥';
  if (streak < 15) return '🔥🔥';
  return '🔥🔥🔥';
}

export function DailyDashboard({ open, onClose }: DailyDashboardProps) {
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [activityDays, setActivityDays] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      getProgress().then(data => {
        setStreak(data.streak);
        setActivityDays(data.activityDays);
      }).catch(() => undefined);
      // slight delay so the CSS transition plays on mount
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  const current = streak?.currentStreak ?? 0;
  const longest = streak?.longestStreak ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      aria-modal="true"
      role="dialog"
      aria-label="Daily dashboard"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl px-6 py-7 transition-all duration-300"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(40px)',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Close"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Streak */}
        <div className="mb-6 text-center">
          <p className="text-5xl font-bold text-stone-900 leading-none">
            {streakEmoji(current)} {current}
          </p>
          <p className="mt-1 text-sm font-medium text-stone-500">
            {current === 1 ? 'day streak' : 'day streak'}
          </p>
          <p className="mt-3 text-sm text-stone-600">{streakMessage(current)}</p>
          {longest > current && (
            <p className="mt-1 text-xs text-stone-400">Personal best: {longest} days</p>
          )}
        </div>

        {/* Calendar */}
        <div className="overflow-x-auto">
          <CalendarHeatmap activityDays={activityDays} weeks={13} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
        >
          Start writing
        </button>
      </div>
    </div>
  );
}
