// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureWord } from '../../client/src/components/CaptureWord';
import { SentenceLab } from '../../client/src/components/SentenceLab';

vi.mock('../../client/src/api', () => ({
  askFollowUp: vi.fn(),
  captureWord: vi.fn(),
  diagnoseSentenceLab: vi.fn(),
  getWordDeepDive: vi.fn(),
  revealSentenceLabResult: vi.fn(),
  saveVocab: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('seeds CaptureWord from an initial word', () => {
  render(<CaptureWord initialWord="margin pressure" onSaved={() => {}} />);

  expect(screen.getByLabelText('Word or phrase')).toHaveValue('margin pressure');
});

it('seeds SentenceLab from an initial sentence', () => {
  render(<SentenceLab initialSentence="We made the implementation yesterday." />);

  expect(screen.getByLabelText('Sentence to check')).toHaveValue('We made the implementation yesterday.');
});
