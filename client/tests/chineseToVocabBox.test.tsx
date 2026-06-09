// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChineseToVocabBox } from '../src/components/ChineseToVocabBox';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('turns a Chinese expression into an English vocab item and saves it', async () => {
  const onSaved = vi.fn();
  const chineseExpression = '\u5229\u6da6\u7387\u538b\u529b';
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/vocab/from-chinese')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 11,
          captureCount: 1,
          existed: false,
          vocab: {
            id: 11,
            word: 'margin pressure',
            kind: 'collocation',
            defCn: chineseExpression,
            source: 'chinese_input',
            captureCount: 1,
            timesSuggested: 0,
            timesUsed: 0,
          },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<ChineseToVocabBox onSaved={onSaved} />);

  fireEvent.change(screen.getByLabelText('Chinese expression'), {
    target: { value: chineseExpression },
  });
  fireEvent.change(screen.getByLabelText('Intended use'), {
    target: { value: 'AI capex may create this.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add English vocab' }));

  expect(await screen.findByText('Saved: margin pressure')).toBeInTheDocument();
  expect(screen.getByText(chineseExpression)).toBeInTheDocument();
  await waitFor(() => {
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ word: 'margin pressure' }));
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/vocab/from-chinese', expect.objectContaining({ method: 'POST' }));
});
