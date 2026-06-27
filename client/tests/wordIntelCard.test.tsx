// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WordIntelCard } from '../src/components/WordIntelCard';

afterEach(() => {
  cleanup();
});

it('highlights the longest matching family form in a rich example', () => {
  const { container } = render(
    <WordIntelCard
      word="run"
      wordFamily={['run', 'running']}
      usageExamplesRich={[
        { sentence: 'The team is running a tighter forecast review.', role: 'verb in progress' },
      ]}
      nearSynonyms={[
        { word: 'operate', distinction: 'Use operate for systems or business processes.' },
      ]}
      onDismiss={() => {}}
    />,
  );

  expect(container.querySelector('mark')).toHaveTextContent('running');
  expect(screen.getByText('verb in progress')).toHaveClass('chip-slate');
  expect(screen.getByText('operate')).toBeInTheDocument();
  expect(screen.getByText(/Use operate for systems/)).toBeInTheDocument();
});

it('falls back to plain usage examples when rich examples are missing', () => {
  const { container } = render(
    <WordIntelCard
      word="allocate"
      wordFamily={['allocate', 'allocation']}
      usageExamples={['A careful allocation can protect runway.']}
      onDismiss={() => {}}
    />,
  );

  expect(container.querySelector('mark')).toHaveTextContent('allocation');
  expect(screen.getByText(/A careful/)).toBeInTheDocument();
});

it('limits near-synonyms and calls dismiss', () => {
  const onDismiss = vi.fn();
  render(
    <WordIntelCard
      word="allocate"
      wordFamily={['allocate']}
      usageExamples={['They allocate capital carefully.']}
      nearSynonyms={[
        { word: 'assign', distinction: 'Use assign for ownership or tasks.' },
        { word: 'apportion', distinction: 'Use apportion for dividing shares.' },
        { word: 'distribute', distinction: 'Use distribute for spreading resources.' },
        { word: 'allot', distinction: 'Use allot for setting aside a portion.' },
      ]}
      onDismiss={onDismiss}
    />,
  );

  expect(screen.getByText('assign')).toBeInTheDocument();
  expect(screen.getByText('apportion')).toBeInTheDocument();
  expect(screen.getByText('distribute')).toBeInTheDocument();
  expect(screen.queryByText('allot')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

  expect(onDismiss).toHaveBeenCalledTimes(1);
});
