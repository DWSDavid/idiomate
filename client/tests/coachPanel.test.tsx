// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { CoachPanel } from '../src/components/CoachPanel';

const ann = [{
  span: 'in order to',
  errorType: 'redundancy',
  hint: 'Two words can do this job.',
  explanation: 'Redundancy.',
  modelRewrite: 'to',
}];

it('hides modelRewrite until submit', () => {
  render(<CoachPanel paragraph="We did X in order to Y" annotations={ann as any} onSubmit={() => {}} />);
  expect(screen.getByText(/Two words can do this job/)).toBeInTheDocument();
  expect(screen.queryByText(/^to$/)).not.toBeInTheDocument();
});
