import React from 'react';

interface WriteSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  onCoachParagraph: (paragraph: string, paragraphIndex: number) => void;
  coachingIndex?: number;
}

function paragraphsFromDraft(value: string): string[] {
  return value
    .split(/\n\s*\n/g)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function WriteSurface({ value, onChange, onCoachParagraph, coachingIndex }: WriteSurfaceProps) {
  const paragraphs = paragraphsFromDraft(value);

  return (
    <section className="surface" aria-label="writing surface">
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">Your draft</span>
        <span className="text-xs text-stone-400">
          {paragraphs.length} paragraph{paragraphs.length === 1 ? '' : 's'}
        </span>
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
