import React, { useEffect, useState } from 'react';
import type { Vocab } from '../../../shared/types';
import { getReviewQueue, recordReview } from '../api';

interface ReviewPanelProps {
  onGoWrite: () => void;
}

type ReviewStatus = 'loading' | 'empty' | 'active' | 'done';

export function ReviewPanel({ onGoWrite }: ReviewPanelProps) {
  const [status, setStatus] = useState<ReviewStatus>('loading');
  const [items, setItems] = useState<Vocab[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [known, setKnown] = useState(0);

  const loadQueue = () => {
    setStatus('loading');
    setItems([]);
    setIndex(0);
    setRevealed(false);
    setKnown(0);
    getReviewQueue()
      .then(result => {
        const nextItems = result.items ?? [];
        setItems(nextItems);
        setStatus(nextItems.length ? 'active' : 'empty');
      })
      .catch(() => setStatus('empty'));
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const activeItem = items[index];

  const handleReview = async (ease: 'easy' | 'hard') => {
    if (!activeItem?.id) return;
    await recordReview(activeItem.id, ease);
    if (ease === 'easy') setKnown(value => value + 1);
    if (index + 1 >= items.length) {
      setStatus('done');
      setRevealed(false);
      return;
    }
    setIndex(value => value + 1);
    setRevealed(false);
  };

  if (status === 'loading') {
    return (
      <section className="surface" aria-label="review">
        <span className="section-label">Review</span>
        <p className="mt-4 text-sm text-stone-500">Loading...</p>
      </section>
    );
  }

  if (status === 'empty') {
    return (
      <section className="surface" aria-label="review">
        <span className="section-label">Review</span>
        <p className="mt-4 text-sm text-stone-500">No words due - come back later or capture new words to review.</p>
      </section>
    );
  }

  if (status === 'done') {
    return (
      <section className="surface" aria-label="review">
        <span className="section-label">Review</span>
        <p className="mt-4 text-lg font-semibold text-slate-950">You knew {known} of {items.length}.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={loadQueue}>
            Review more
          </button>
          <button type="button" className="btn-primary" onClick={onGoWrite}>
            Go write
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="surface" aria-label="review">
      <div className="flex items-start justify-between gap-3">
        <span className="section-label">Review</span>
        <span className="text-sm font-semibold text-slate-500">{index + 1} / {items.length}</span>
      </div>

      <div className="result-block mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-950">{activeItem.word}</h2>
          {activeItem.pos ? <span className="chip chip-slate">{activeItem.pos}</span> : null}
          {activeItem.kind ? <span className="chip">{activeItem.kind}</span> : null}
        </div>

        {!revealed ? (
          <button type="button" className="btn-primary mt-4" onClick={() => setRevealed(true)}>
            Reveal
          </button>
        ) : (
          <div className="mt-4 space-y-4">
            {activeItem.defCn ? <p className="text-sm leading-6 text-slate-600">Meaning: {activeItem.defCn}</p> : null}
            {activeItem.examples?.length ? (
              <div>
                <p className="section-label">Examples</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {activeItem.examples.slice(0, 2).map(example => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {activeItem.collocations?.length ? (
              <div>
                <p className="section-label">Collocations</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeItem.collocations.slice(0, 2).map(collocation => (
                    <span key={collocation} className="chip chip-blue">{collocation}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void handleReview('easy')}>
                Got it
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleReview('hard')}>
                Again
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
