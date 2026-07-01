import React, { useEffect, useState } from 'react';
import type { Prompt } from '../../../shared/types';
import { getPromptLibrary, getTodayPrompt, savePrompt, usePrompt } from '../api';

interface DailyPromptProps {
  onPrompt: (prompt: Prompt) => void;
}

type PromptLength = 'quick' | 'essay';

export function DailyPrompt({ onPrompt }: DailyPromptProps) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [length, setLength] = useState<PromptLength>('quick');
  const [savedPrompts, setSavedPrompts] = useState<Prompt[]>([]);
  const [recentPrompts, setRecentPrompts] = useState<Prompt[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const activeText = prompt
    ? length === 'essay' && prompt.essayPrompt ? prompt.essayPrompt : prompt.text
    : '';

  // Feed the parent the version the writer is actually looking at, so vocab priming and the
  // writing pane track the short-vs-essay choice, while keeping id/date/theme intact.
  useEffect(() => {
    if (prompt) onPrompt({ ...prompt, text: activeText });
  }, [prompt, activeText]);

  const loadLibrary = async () => {
    const [saved, recent] = await Promise.all([
      getPromptLibrary({ savedOnly: true, limit: 8 }),
      getPromptLibrary({ limit: 8 }),
    ]);
    setSavedPrompts(saved.prompts ?? []);
    setRecentPrompts(recent.prompts ?? []);
  };

  const loadPrompt = async () => {
    setStatus('loading');
    try {
      const next = await getTodayPrompt();
      setPrompt(next);
      if (length === 'essay' && !next.essayPrompt) setLength('quick');
      void loadLibrary().catch(() => undefined);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  const handleSavePrompt = async () => {
    if (!prompt?.id || saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const next = await savePrompt(prompt.id, !prompt.saved);
      setPrompt(current => (current ? { ...next } : next));
      await loadLibrary();
      setSaveStatus('idle');
    } catch {
      setSaveStatus('error');
    }
  };

  const handleUsePrompt = async (item: Prompt) => {
    try {
      const next = item.id ? await usePrompt(item.id) : item;
      setPrompt(next);
      if (length === 'essay' && !next.essayPrompt) setLength('quick');
      void loadLibrary().catch(() => undefined);
    } catch {
      setPrompt(item);
    }
  };

  useEffect(() => {
    void loadPrompt();
  }, []);

  const promptList = (title: string, prompts: Prompt[]) => prompts.length ? (
    <div className="prompt-bank-group">
      <p className="section-label">{title}</p>
      <div className="mt-2 grid gap-2">
        {prompts.map(item => (
          <button
            key={item.id ?? item.text}
            type="button"
            className="prompt-bank-item"
            onClick={() => void handleUsePrompt(item)}
          >
            <span className="font-semibold text-slate-800">{item.theme}</span>
            <span className="mt-1 text-left text-sm leading-5 text-slate-600">{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const hasEssay = Boolean(prompt?.essayPrompt);

  return (
    <section className="surface" aria-label="daily prompt">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span className="section-label">Today's prompt{prompt?.theme ? ` - ${prompt.theme}` : ''}</span>
        <div className="flex flex-wrap gap-2">
          {prompt?.id ? (
            <button type="button" className="btn-ghost" onClick={() => void handleSavePrompt()} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving' : prompt.saved ? 'Saved' : 'Save prompt'}
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={loadPrompt} disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading' : 'New prompt'}
          </button>
        </div>
      </div>

      {hasEssay ? (
        <div className="mt-3 flex rounded-full border border-slate-200 bg-white p-1" role="tablist" aria-label="prompt length">
          {(['quick', 'essay'] as const).map(option => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={length === option}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                length === option ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              onClick={() => setLength(option)}
            >
              {option === 'quick' ? 'Quick take' : 'Essay'}
            </button>
          ))}
        </div>
      ) : null}

      <p className="prose mt-4 text-xl">
        {activeText || (status === 'error' ? 'Could not load a prompt.' : 'Loading a prompt for you.')}
      </p>
      {length === 'essay' && hasEssay ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Take a clear stance, support it with reasons and evidence, and address one counterargument.
        </p>
      ) : null}
      {saveStatus === 'error' ? <p className="mt-2 text-sm text-red-700">Could not update this prompt.</p> : null}

      {prompt?.sourceQuotes?.length ? (
        <div className="mt-4">
          <p className="section-label">Quotable sources</p>
          <p className="mt-1 text-xs text-slate-500">Verbatim from the sources below - cite directly or paraphrase in your own words.</p>
          <ul className="mt-2 space-y-2">
            {prompt.sourceQuotes.map((item, index) => (
              <li key={item.link ? `${item.link}-${index}` : index} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <blockquote className="text-sm leading-6 text-slate-800">&ldquo;{item.quote}&rdquo;</blockquote>
                {item.source || item.link ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-violet-700 hover:underline">
                        {item.source || 'Source'}
                      </a>
                    ) : (
                      <span>{item.source}</span>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {prompt?.newsItems?.length ? (
        <div className="mt-4">
          <p className="section-label">For context</p>
          <ul className="mt-2 space-y-2">
            {prompt.newsItems.map(item => (
              <li key={item.link ?? item.title} className="text-sm leading-6">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-800 underline-offset-2 hover:text-violet-700 hover:underline"
                >
                  {item.title}
                </a>
                {item.source ? (
                  <span className="ml-2 text-xs text-slate-400">{item.source}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="prompt-bank mt-4">
        {promptList('Saved prompts', savedPrompts)}
        {promptList('Recent prompts', recentPrompts)}
      </div>
    </section>
  );
}
