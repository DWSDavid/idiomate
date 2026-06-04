import React, { useEffect, useState } from 'react';
import type { Prompt } from '../../../shared/types';
import { getTodayPrompt } from '../api';

interface DailyPromptProps {
  onPrompt: (prompt: Prompt) => void;
}

export function DailyPrompt({ onPrompt }: DailyPromptProps) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const loadPrompt = async () => {
    setStatus('loading');
    try {
      const next = await getTodayPrompt();
      setPrompt(next);
      onPrompt(next);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void loadPrompt();
  }, []);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-label="daily prompt">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Daily Prompt</h2>
          {prompt ? <p className="mt-1 text-sm uppercase tracking-normal text-zinc-500">{prompt.theme}</p> : null}
        </div>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
          onClick={loadPrompt}
        >
          New Prompt
        </button>
      </div>
      <p className="mt-4 text-base leading-7 text-zinc-900">
        {prompt?.text ?? (status === 'error' ? 'Could not load prompt.' : 'Loading prompt...')}
      </p>
    </section>
  );
}
