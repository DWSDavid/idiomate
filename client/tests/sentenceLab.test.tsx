// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SentenceLab } from '../src/components/SentenceLab';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('diagnoses a sentence without showing the native version until the user submits a rewrite', async () => {
  const onRecorded = vi.fn();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/sentence-lab/diagnose')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 7,
          sentence: 'We made the implementation yesterday.',
          context: 'Slack update',
          notes: [{
            span: 'made the implementation',
            errorType: 'noun_plague',
            hint: 'Find the action and make it the verb.',
            explanation: 'The action is hidden in a noun.',
            rule: 'Prefer a verb over a noun string',
            bookReference: {
              source: "The Translator's Guide to Chinglish",
              pattern: 'Noun Plague',
              quote: 'while the real action is expressed in the noun',
            },
          }],
        }),
      } as Response);
    }
    if (url.includes('/api/sentence-lab/result')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 7,
          sentence: 'We made the implementation yesterday.',
          context: 'Slack update',
          rewrite: 'We implemented it yesterday.',
          nativeVersion: 'We implemented it yesterday.',
          annotations: [{
            span: 'made the implementation',
            errorType: 'noun_plague',
            hint: 'Find the action and make it the verb.',
            explanation: 'The action is hidden in a noun.',
            rule: 'Prefer a verb over a noun string',
            ruleExample: { before: 'made the implementation', after: 'implemented' },
            modelRewrite: 'implemented',
            userRewrite: 'We implemented it yesterday.',
            bookReference: {
              source: "The Translator's Guide to Chinglish",
              pattern: 'Noun Plague',
              quote: 'while the real action is expressed in the noun',
            },
          }],
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SentenceLab onRecorded={onRecorded} />);

  fireEvent.change(screen.getByLabelText('Sentence to check'), {
    target: { value: 'We made the implementation yesterday.' },
  });
  fireEvent.change(screen.getByLabelText('Context'), {
    target: { value: 'Slack update' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check sentence' }));

  expect(await screen.findByText('made the implementation')).toBeInTheDocument();
  expect(screen.getByText('Find the action and make it the verb.')).toBeInTheDocument();
  expect(screen.getByText("The Translator's Guide to Chinglish")).toBeInTheDocument();
  expect(screen.queryByText('We implemented it yesterday.')).not.toBeInTheDocument();
  expect(screen.queryByText('implemented')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  fireEvent.change(screen.getByLabelText('Your rewrite'), {
    target: { value: 'We implemented it yesterday.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reveal after my rewrite' }));

  await waitFor(() => {
    expect(onRecorded).toHaveBeenCalledTimes(2);
  });
  expect(await screen.findByText('Native version')).toBeInTheDocument();
  expect(screen.getByText('We implemented it yesterday.')).toBeInTheDocument();
  expect(screen.getAllByText('implemented').length).toBeGreaterThan(0);
});
