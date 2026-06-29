// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { CoachPanel } from '../src/components/CoachPanel';

const ann = [{
  span: 'in order to',
  errorType: 'redundancy',
  hint: 'Two words can do this job.',
  explanation: 'Redundancy.',
  rule: 'Drop empty category nouns',
  ruleExample: { before: 'in order to', after: 'to' },
  bookReference: {
    source: "The Translator's Guide to Chinglish",
    pattern: 'Unnecessary Words',
    quote: 'A sentence should contain no unnecessary words',
  },
  modelRewrite: 'to',
}];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows actionable fix guidance before submit while hiding the full native rewrite', () => {
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);
  expect(screen.getByText(/Two words can do this job/)).toBeInTheDocument();
  expect(screen.getByText('What to change')).toBeInTheDocument();
  expect(screen.getByText('Why it matters')).toBeInTheDocument();
  expect(screen.getByText('Try this pattern')).toBeInTheDocument();
  expect(screen.getByText('From your text')).toBeInTheDocument();
  expect(screen.getByText('Change to')).toBeInTheDocument();
  expect(screen.queryByText('Native version')).not.toBeInTheDocument();
});

it('answers paragraph follow-up questions before and after rewrite without changing the reveal flow', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/follow-up')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { mode: string };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          answer: body.mode === 'pre_rewrite'
            ? 'Think about whether those three words add a new idea.'
            : 'The native version keeps the same meaning with a lighter structure.',
          mode: body.mode,
        }),
      } as Response);
    }
    if (url.includes('/api/paragraph-result')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 9 }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CoachPanel
      paragraph="We did X in order to Y"
      nativeVersion="We did X to Y."
      annotations={ann as any}
      recordContext={{ paragraphIdx: 0 }}
      onSubmit={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText('Follow-up question'), {
    target: { value: 'Why is this wordy?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask follow-up' }));

  expect(await screen.findByText('Think about whether those three words add a new idea.')).toBeInTheDocument();
  const preBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? '{}')) as { mode: string };
  expect(preBody.mode).toBe('pre_rewrite');
  expect(screen.queryByText('We did X to Y.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  fireEvent.change(screen.getByLabelText('Follow-up question'), {
    target: { value: 'Why is the native version better?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask follow-up' }));

  expect(await screen.findByText('The native version keeps the same meaning with a lighter structure.')).toBeInTheDocument();
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/api/paragraph-result', expect.objectContaining({ method: 'POST' }));
  });
  const followUpCalls = fetchMock.mock.calls.filter(call => String(call[0]).includes('/api/follow-up'));
  const postBody = JSON.parse(String(followUpCalls[1][1]?.body ?? '{}')) as { mode: string; nativeVersion?: string };
  expect(postBody.mode).toBe('post_rewrite');
  expect(postBody.nativeVersion).toBe('We did X to Y.');
});

it('keeps the native version hidden while the user is drafting', () => {
  const onSubmit = vi.fn();
  render(
    <CoachPanel
      paragraph="We did X in order to Y"
      nativeVersion="We did X to Y."
      annotations={ann as any}
      onSubmit={onSubmit}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));

  expect(screen.queryByText('Native version')).not.toBeInTheDocument();
  expect(screen.queryByText('We did X to Y.')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.getByText('Native version')).toBeInTheDocument();
  expect(onSubmit).toHaveBeenCalledWith('We did X to Y', expect.any(Array));
});

it('summarizes exact changes without showing a struck-through original line', () => {
  const { container } = render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.getByText('From your text')).toBeInTheDocument();
  expect(screen.getByText('Change to')).toBeInTheDocument();
  expect(container.querySelector('.line-through')).not.toBeInTheDocument();
});

it('hides nativeVersion until the user submits a rewrite', () => {
  render(
    <CoachPanel
      paragraph="We did X in order to Y"
      nativeVersion="We did X to Y."
      annotations={ann as any}
      onSubmit={() => {}}
    />,
  );

  expect(screen.queryByText('We did X to Y.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));

  expect(screen.queryByText('We did X to Y.')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X so Y happens.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.getByText((_, node) => node?.textContent === 'We did X to Y.')).toBeInTheDocument();
  expect(screen.getByText('Drop empty category nouns')).toBeInTheDocument();
  expect(screen.getAllByText('in order to').length).toBeGreaterThan(0);
  expect(screen.getByText("The Translator's Guide to Chinglish")).toBeInTheDocument();
  expect(screen.getByText(/A sentence should contain no unnecessary words/)).toBeInTheDocument();
});

it('offers content research only after the user submits a rewrite', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      analysis: 'The argument needs fresher evidence.',
      otherAngles: ['Supplier constraints'],
      sources: [
        {
          title: 'Cloud firms raise AI spending',
          link: 'https://example.com/ai-capex',
          summary: 'Cloud providers are raising AI infrastructure budgets.',
        },
      ],
      integratedEssay: 'We did X to Y. Current evidence would make the claim stronger.',
      integrationNotes: [
        {
          insertedAfter: 'We did X to Y.',
          what: 'Added evidence slot.',
          why: 'It supports the claim.',
          structurePart: 'evidence',
        },
      ],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);

  expect(screen.queryByRole('button', { name: 'Evidence check' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));
  expect(screen.getByText('After-rewrite lab')).toBeInTheDocument();
  expect(screen.getByText('Check evidence, structure, and the source slots before you turn this into a final draft.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evidence check' }));

  expect(await screen.findByText('The argument needs fresher evidence.')).toBeInTheDocument();
  expect(screen.getByText('Cloud firms raise AI spending')).toBeInTheDocument();
  expect(screen.getByText('We did X to Y. Current evidence would make the claim stronger.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/research', expect.objectContaining({ method: 'POST' }));
});

it('offers structure guidance only after the user submits a rewrite', async () => {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      idealOutline: [
        { part: 'Topic sentence', purpose: 'State the central claim.' },
        { part: 'Evidence', purpose: 'Support the claim with specifics.' },
      ],
      observations: [
        { part: 'Topic sentence', status: 'present', note: 'The claim appears early.' },
        { part: 'Evidence', status: 'weak', note: 'The draft needs a concrete fact.' },
      ],
    }),
  } as Response));
  vi.stubGlobal('fetch', fetchMock);

  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);

  expect(screen.queryByRole('button', { name: 'Structure check' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));
  expect(screen.getByText('After-rewrite lab')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Structure check' }));

  expect(await screen.findByText('State the central claim.')).toBeInTheDocument();
  expect(screen.getByText('Support the claim with specifics.')).toBeInTheDocument();
  expect(screen.getByText('The draft needs a concrete fact.')).toBeInTheDocument();
  expect(screen.getByText('weak')).toHaveClass('status-weak');
  expect(fetchMock).toHaveBeenCalledWith('/api/structure', expect.objectContaining({ method: 'POST' }));
});

it('shows distinction text and inline save buttons for vocab_suggestion; saves on "New to me"', async () => {
  let capturedWord = '';
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/vocab/capture-save')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { word: string };
      capturedWord = body.word;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 99, captureCount: 1, existed: false, vocab: { word: body.word } }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  const vocabAnnotation = [{
    span: 'give out',
    errorType: 'vocab_suggestion' as const,
    hint: 'A more precise verb exists.',
    explanation: 'Native writers use allocate here.',
    modelRewrite: 'allocate',
    vocabWord: 'allocate',
    distinction: 'give out is generic and informal; allocate implies intentional distribution with planning and authority.',
  }];

  render(<CoachPanel paragraph="We give out resources." annotations={vocabAnnotation} onSubmit={() => {}} />);

  // distinction text visible
  expect(await screen.findByText(/give out is generic and informal/)).toBeInTheDocument();

  // inline save buttons
  expect(screen.getByRole('button', { name: 'I know it' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New to me — save' })).toBeInTheDocument();

  // click save
  fireEvent.click(screen.getByRole('button', { name: 'New to me — save' }));

  await waitFor(() => {
    expect(capturedWord).toBe('allocate');
  });

  // confirmation shown, buttons gone
  expect(await screen.findByText(/Saved to your words/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New to me — save' })).not.toBeInTheDocument();
});

it('shows Grammar fix and Elevated tabs after submit when elevatedVersion is present', () => {
  render(
    <CoachPanel
      paragraph="We did X in order to Y"
      nativeVersion="We did X to Y."
      elevatedVersion="By trimming the redundancy, we sharpen the causal link between X and Y."
      elevationNotes="Removed filler phrase and made the connection explicit."
      annotations={ann as any}
      onSubmit={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.getByRole('button', { name: 'Grammar fix' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Elevated' })).toBeInTheDocument();

  // Grammar fix tab is active by default — native version visible
  expect(screen.getByText('Native version')).toBeInTheDocument();

  // Switch to Elevated tab
  fireEvent.click(screen.getByRole('button', { name: 'Elevated' }));
  expect(screen.getByText('By trimming the redundancy, we sharpen the causal link between X and Y.')).toBeInTheDocument();
  expect(screen.getByText('Removed filler phrase and made the connection explicit.')).toBeInTheDocument();
  expect(screen.getByText('Elevated version')).toBeInTheDocument();
});

it('does not show tabs when elevatedVersion is absent', () => {
  render(
    <CoachPanel
      paragraph="We did X in order to Y"
      nativeVersion="We did X to Y."
      annotations={ann as any}
      onSubmit={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.queryByRole('button', { name: 'Grammar fix' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Elevated' })).not.toBeInTheDocument();
  expect(screen.getByText('Native version')).toBeInTheDocument();
});

it('"I know it" dismisses the save prompt without calling the API', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const vocabAnnotation = [{
    span: 'give out',
    errorType: 'vocab_suggestion' as const,
    hint: 'A more precise verb exists.',
    explanation: 'Native writers use allocate here.',
    modelRewrite: 'allocate',
    vocabWord: 'allocate',
    distinction: 'give out is generic; allocate is the professional term.',
  }];

  render(<CoachPanel paragraph="We give out resources." annotations={vocabAnnotation} onSubmit={() => {}} />);

  fireEvent.click(screen.getByRole('button', { name: 'I know it' }));

  expect(screen.queryByRole('button', { name: 'I know it' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New to me — save' })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('capture-save'), expect.anything());
});
