// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CompareView, type ComparedAnnotation } from '../src/components/CompareView';

afterEach(() => {
  cleanup();
});

function makeAnnotation(overrides: Partial<ComparedAnnotation> = {}): ComparedAnnotation {
  return {
    span: 'implementation of the policy',
    errorType: 'noun_plague',
    hint: 'Try a verb',
    explanation: 'Noun plague',
    modelRewrite: 'implemented the policy',
    ...overrides,
  };
}

it('shows addressed count when some annotations are accepted', () => {
  render(
    <CompareView
      original="We carried out the implementation of the policy."
      rewrite="We implemented the policy."
      annotations={[
        makeAnnotation({ accepted: true }),
        makeAnnotation({ span: 'carried out', accepted: false }),
        makeAnnotation({ span: 'make a discussion', accepted: true }),
      ]}
    />,
  );

  expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
});

it('hides score banner when no annotations exist', () => {
  render(
    <CompareView
      original="Great sentence."
      rewrite="Great sentence."
      annotations={[]}
    />,
  );

  expect(screen.queryByText(/You addressed/i)).not.toBeInTheDocument();
});

it('excludes vocab suggestions from score count', () => {
  render(
    <CompareView
      original="We use every advantage."
      rewrite="We use every advantage."
      annotations={[
        makeAnnotation({ accepted: true }),
        makeAnnotation({
          span: 'use',
          errorType: 'vocab_suggestion',
          vocabWord: 'leverage',
          accepted: false,
        }),
      ]}
    />,
  );

  expect(screen.getByText(/1 of 1/)).toBeInTheDocument();
});
