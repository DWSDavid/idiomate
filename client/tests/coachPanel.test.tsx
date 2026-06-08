// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

it('hides modelRewrite until submit', () => {
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);
  expect(screen.getByText(/Two words can do this job/)).toBeInTheDocument();
  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument();
});

it('keeps the rewrite and explanation hidden while the user is drafting', () => {
  const onSubmit = vi.fn();
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={onSubmit} />);

  fireEvent.click(screen.getByRole('button', { name: 'Try the rewrite' }));

  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument();
  expect(screen.queryByText('Redundancy.')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit rewrite' }));

  expect(screen.getAllByText(/^to$/).length).toBeGreaterThan(0);
  expect(screen.getByText('Redundancy.')).toBeInTheDocument();
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
