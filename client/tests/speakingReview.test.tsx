// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpeakingReview } from '../src/components/SpeakingReview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reviews a pasted speaking transcript and renders the saved result', async () => {
  const onReviewed = vi.fn();
  const returnedResult = {
    id: 42,
    transcript: 'I think this article has a useful perspective about AI agents.',
    nativeVersion: 'I think this article offers a useful perspective on AI agents.',
    takeaways: ['Use "offers a perspective" for what an article does.'],
    context: { label: 'reading_reaction' },
    annotations: [{
      span: 'has a useful perspective',
      errorType: 'word_choice',
      hint: 'Use a more natural verb.',
      explanation: 'Articles usually offer a perspective.',
      modelRewrite: 'offers a useful perspective',
      accepted: true,
    }],
  };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/speaking/review');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(expect.objectContaining({
      transcript: 'I think this article has a useful perspective about AI agents.',
      contextLabel: 'reading_reaction',
      context: 'After reading a market note',
    }));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(returnedResult),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SpeakingReview onReviewed={onReviewed} />);

  fireEvent.change(screen.getByLabelText('Speech-to-text transcript'), {
    target: { value: '  I think this article has a useful perspective about AI agents.  ' },
  });
  fireEvent.change(screen.getByLabelText('Context'), {
    target: { value: '  After reading a market note  ' },
  });
  fireEvent.change(screen.getByLabelText('Review type'), {
    target: { value: 'reading_reaction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze transcript' }));

  expect(await screen.findByText('Native spoken version')).toBeInTheDocument();
  expect(screen.getByText('I think this article offers a useful perspective on AI agents.')).toBeInTheDocument();
  expect(screen.getByText('has a useful perspective')).toBeInTheDocument();
  expect(screen.getByText('Use "offers a perspective" for what an article does.')).toBeInTheDocument();
  await waitFor(() => {
    expect(onReviewed).toHaveBeenCalledTimes(1);
    expect(onReviewed).toHaveBeenCalledWith(returnedResult);
  });
});

it('shows context defaults when only an excerpt is available', () => {
  render(<SpeakingReview contextDefaults={{ contextExcerpt: 'Selected paragraph about AI agents.' }} />);

  expect(screen.getByText('Selected paragraph about AI agents.')).toBeInTheDocument();
});
