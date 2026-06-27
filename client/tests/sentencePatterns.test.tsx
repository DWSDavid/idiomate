// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SentencePatterns } from '../src/components/SentencePatterns';

afterEach(() => cleanup());

it('renders all 8 pattern titles', () => {
  render(<SentencePatterns />);
  expect(screen.getByText('Simple assertion')).toBeInTheDocument();
  expect(screen.getByText('Causal chain')).toBeInTheDocument();
  expect(screen.getByText('Concession + pivot')).toBeInTheDocument();
  expect(screen.getByText('Fronted adverb')).toBeInTheDocument();
  expect(screen.getByText('Subject complement')).toBeInTheDocument();
  expect(screen.getByText('Parallel list')).toBeInTheDocument();
  expect(screen.getByText('Conditional')).toBeInTheDocument();
  expect(screen.getByText('Passive emphasis')).toBeInTheDocument();
});

it('renders coloured subject and verb spans', () => {
  render(<SentencePatterns />);
  const subjects = document.querySelectorAll('.part-subject');
  const verbs = document.querySelectorAll('.part-verb');
  expect(subjects.length).toBeGreaterThan(0);
  expect(verbs.length).toBeGreaterThan(0);
});

it('renders formula chips for at least two patterns', () => {
  render(<SentencePatterns />);
  expect(screen.getByText('S + V + O')).toBeInTheDocument();
  expect(screen.getByText('S + linking-V + Adj')).toBeInTheDocument();
});

it('renders the Patterns section label', () => {
  render(<SentencePatterns />);
  expect(screen.getByText('Sentence patterns')).toBeInTheDocument();
});
