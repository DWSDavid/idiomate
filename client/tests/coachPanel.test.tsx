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
  modelRewrite: 'to',
}];

afterEach(() => {
  cleanup();
});

it('hides modelRewrite until submit', () => {
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);
  expect(screen.getByText(/Two words can do this job/)).toBeInTheDocument();
  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument();
});

it('keeps the rewrite and explanation hidden while the user is drafting', () => {
  const onSubmit = vi.fn();
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={onSubmit} />);

  fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument();
  expect(screen.queryByText('Redundancy.')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X to Y' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Rewrite' }));

  expect(screen.getAllByText(/^to$/).length).toBeGreaterThan(0);
  expect(screen.getByText('Redundancy.')).toBeInTheDocument();
  expect(onSubmit).toHaveBeenCalledWith('We did X to Y', expect.any(Array));
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

  fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

  expect(screen.queryByText('We did X to Y.')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We did X so Y happens.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Rewrite' }));

  expect(screen.getByText((_, node) => node?.textContent === 'We did X to Y.')).toBeInTheDocument();
  expect(screen.getByText('Drop empty category nouns')).toBeInTheDocument();
  expect(screen.getAllByText('in order to').length).toBeGreaterThan(0);
});
