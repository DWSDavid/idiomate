import React, { useEffect, useState } from 'react';
import type { Prompt } from '../../../shared/types';
import { getTodayPrompt } from '../api';

interface DailyPromptProps {
  onPrompt: (prompt: Prompt) => void;
}

export function DailyPrompt({ onPrompt }: DailyPromptProps) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');

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
    <section className="surface" aria-label="daily prompt">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span className="section-label">Today's prompt{prompt?.theme ? ` - ${prompt.theme}` : ''}</span>
        <button type="button" className="btn-ghost" onClick={loadPrompt} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading' : 'New prompt'}
        </button>
      </div>
      <p className="prose mt-4 text-xl">
        {prompt?.text ?? (status === 'error' ? 'Could not load a prompt.' : 'Loading a prompt for you.')}
      </p>
    </section>
  );
}
