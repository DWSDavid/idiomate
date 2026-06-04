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
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-label="writing surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">Draft</h2>
        <span className="text-sm text-zinc-500">{paragraphs.length} paragraphs</span>
      </div>

      <textarea
        aria-label="Draft"
        className="mt-4 min-h-72 w-full rounded-md border border-zinc-300 bg-white p-4 text-base leading-7 text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        value={value}
        onChange={event => onChange(event.target.value)}
      />

      <div className="mt-4 space-y-2">
        {paragraphs.map((paragraph, index) => (
          <div key={`${index}-${paragraph.slice(0, 24)}`} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2">
            <p className="min-w-0 truncate text-sm text-zinc-700">Paragraph {index + 1}</p>
            <button
              type="button"
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={coachingIndex === index}
              onClick={() => onCoachParagraph(paragraph, index)}
            >
              {coachingIndex === index ? 'Coaching...' : 'Coach'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
