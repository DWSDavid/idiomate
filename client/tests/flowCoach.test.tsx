// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { analyzeFlow, checkFlowDrill } from '../src/api';
import { FlowCoach } from '../src/components/FlowCoach';

vi.mock('../src/api', () => ({
  analyzeFlow: vi.fn(async () => ({
    lines: [
      {
        original: 'I read a lot. My writing is weak.',
        pieces: ['I read a lot', 'my writing feels weak'],
        rewrite: 'Even though I read a lot, my writing still feels weak.',
        linkToPrevious: { connective: 'Even though', why: 'front-loads the concession' },
        tenseNote: { tense: 'present', why: 'ongoing state' },
        changes: ['merged into one sentence'],
        drill: {
          prompt: 'Link: "The plan slipped. The launch moved." with a cause connective.',
          targetSkill: 'cause-effect connective',
          vocabUsed: ['as a result'],
          modelAnswer: 'The plan slipped; as a result, the launch moved.',
        },
      },
    ],
  })),
  checkFlowDrill: vi.fn(async () => ({
    correct: true,
    feedback: 'Good use of "as a result" with past tense.',
    modelAnswer: 'The plan slipped; as a result, the launch moved.',
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('analyzes a draft and renders the rewrite, why-notes, and drill', async () => {
  render(<FlowCoach initialDraft="I read a lot. My writing is weak." />);

  fireEvent.click(screen.getByRole('button', { name: 'Analyze flow' }));

  await waitFor(() => {
    expect(screen.getByText('Even though I read a lot, my writing still feels weak.')).toBeInTheDocument();
  });
  expect(analyzeFlow).toHaveBeenCalledWith('I read a lot. My writing is weak.', '');
  expect(screen.getByText(/Link: Even though/)).toBeInTheDocument();
  expect(screen.getByText(/Tense: present/)).toBeInTheDocument();
  expect(screen.getByText('cause-effect connective')).toBeInTheDocument();
  expect(screen.getByText('as a result')).toBeInTheDocument();
});

it('checks a drill attempt and reveals feedback plus the model answer', async () => {
  render(<FlowCoach initialDraft="I read a lot. My writing is weak." />);
  fireEvent.click(screen.getByRole('button', { name: 'Analyze flow' }));

  const drillBox = await screen.findByPlaceholderText('Write your version here...');
  fireEvent.change(drillBox, { target: { value: 'The plan slipped, as a result the launch moved.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));

  await waitFor(() => {
    expect(screen.getByText('✓ Nicely linked')).toBeInTheDocument();
  });
  expect(checkFlowDrill).toHaveBeenCalledWith({
    drillPrompt: 'Link: "The plan slipped. The launch moved." with a cause connective.',
    targetSkill: 'cause-effect connective',
    attempt: 'The plan slipped, as a result the launch moved.',
  });
  expect(screen.getByText(/Good use of "as a result"/)).toBeInTheDocument();
  expect(screen.getAllByText(/as a result, the launch moved\./).length).toBeGreaterThan(0);
});

it('does not analyze a too-short draft', () => {
  render(<FlowCoach initialDraft="hi" />);
  const button = screen.getByRole('button', { name: 'Analyze flow' });
  expect(button).toBeDisabled();
});
