// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminPanel } from '../src/components/AdminPanel';
import { HistoryPanel } from '../src/components/HistoryPanel';
import { OwnerVocabImport } from '../src/components/OwnerVocabImport';
import { getAdminUserDetail, getAdminUsers, getHistory, importOwnerVocab } from '../src/api';

vi.mock('../src/api', () => ({
  importOwnerVocab: vi.fn(async () => ({ imported: 2716, total: 2716 })),
  getHistory: vi.fn(async () => ({
    entries: [
      {
        id: 1,
        date: '2026-06-08',
        source: 'daily_writing',
        draftText: 'My draft.',
        finalText: 'My revised draft.',
        annotations: [{ span: 'draft', errorType: 'word_choice', rule: 'Word choice' }],
      },
      {
        id: 2,
        date: '2026-06-08',
        source: 'sentence_lab',
        draftText: 'He discussed about the roadmap.',
        finalText: 'He discussed the roadmap.',
        annotations: [],
      },
    ],
  })),
  getAdminUsers: vi.fn(async () => ({
    users: [
      { id: 'alice', name: 'Alice', vocabCount: 2, sessionCount: 3, sentenceLabCount: 1 },
    ],
  })),
  getAdminUserDetail: vi.fn(async () => ({
    user: { id: 'alice', name: 'Alice', vocabCount: 2, sessionCount: 3, sentenceLabCount: 1 },
    vocab: {
      total: 2,
      items: [{ word: 'equal footing', kind: 'phrase', captureCount: 1, timesSuggested: 0, timesUsed: 0, capturedDate: '2026-06-08' }],
    },
    history: {
      entries: [{ id: 1, source: 'daily_writing', draftText: 'Alice draft', annotations: [] }],
    },
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('imports owner vocabulary with a code and reports the total', async () => {
  render(<OwnerVocabImport onImported={() => {}} />);

  fireEvent.change(screen.getByLabelText('Owner vocab code'), { target: { value: 'owner-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import owner vocab' }));

  expect(await screen.findByText('Imported 2716 words. Total: 2716.')).toBeInTheDocument();
  expect(importOwnerVocab).toHaveBeenCalledWith('owner-code');
});

it('renders saved daily writing and sentence lab history', async () => {
  render(<HistoryPanel />);

  expect(await screen.findByText('Writing history')).toBeInTheDocument();
  expect(screen.getByText('daily writing')).toBeInTheDocument();
  expect(screen.getByText('sentence lab')).toBeInTheDocument();
  expect(screen.getByText('My draft.')).toBeInTheDocument();
  expect(screen.getByText('He discussed the roadmap.')).toBeInTheDocument();
  expect(getHistory).toHaveBeenCalled();
});

it('loads admin users and opens a user detail with vocab and writing history', async () => {
  render(<AdminPanel />);

  fireEvent.change(screen.getByLabelText('Admin code'), { target: { value: 'admin-code' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load users' }));

  expect(await screen.findByText('Alice')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open Alice' }));

  await waitFor(() => expect(getAdminUserDetail).toHaveBeenCalledWith('admin-code', 'alice'));
  expect(screen.getByText('equal footing')).toBeInTheDocument();
  expect(screen.getByText('Alice draft')).toBeInTheDocument();
  expect(getAdminUsers).toHaveBeenCalledWith('admin-code');
});
