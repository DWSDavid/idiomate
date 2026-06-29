import React, { useState } from 'react';

type WritingSource = 'daily_writing' | 'free_writing';

interface WriteSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  onCoachParagraph: (paragraph: string, paragraphIndex: number) => void;
  coachingIndex?: number;
  onSourceChange?: (source: WritingSource) => void;
}

function paragraphsFromDraft(value: string): string[] {
  return value
    .split(/\n\s*\n/g)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function WriteSurface({ value, onChange, onCoachParagraph, coachingIndex, onSourceChange }: WriteSurfaceProps) {
  const [writingSource, setWritingSource] = useState<WritingSource>('daily_writing');
  const paragraphs = paragraphsFromDraft(value);

  const handleSourceChange = (source: WritingSource) => {
    setWritingSource(source);
    onSourceChange?.(source);
  };

  return (
    <section className="surface" aria-label="writing surface">
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">Your draft</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs font-medium" role="group" aria-label="Writing type">
            <button
              type="button"
              className={`px-3 py-1 transition-colors ${writingSource === 'daily_writing' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
              aria-pressed={writingSource === 'daily_writing'}
              onClick={() => handleSourceChange('daily_writing')}
            >
              Daily
            </button>
            <button
              type="button"
              className={`px-3 py-1 transition-colors border-l border-stone-200 ${writingSource === 'free_writing' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
              aria-pressed={writingSource === 'free_writing'}
              onClick={() => handleSourceChange('free_writing')}
            >
              Free (随手写)
            </button>
          </div>
          <span className="text-xs text-stone-400">
            {paragraphs.length} paragraph{paragraphs.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <textarea
        aria-label="Draft"
        placeholder="Write a full paragraph, then ask the coach. Finish your thought before you stop."
        className="prose mt-4 min-h-72 w-full resize-y rounded-xl border border-stone-200 bg-stone-50/40 p-4 text-lg outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        value={value}
        onChange={event => onChange(event.target.value)}
      />

      {paragraphs.length ? (
        <div className="mt-4 space-y-2">
          {paragraphs.map((paragraph, index) => (
            <div
              key={`${index}-${paragraph.slice(0, 24)}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm text-stone-500">
                {index + 1}. {paragraph}
              </p>
              <button
                type="button"
                className="btn-ghost shrink-0"
                disabled={coachingIndex === index}
                onClick={() => onCoachParagraph(paragraph, index)}
              >
                {coachingIndex === index ? 'Coaching' : 'Coach'}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
