import { expect, it } from 'vitest';
import { findChinglishBookReference } from '../src/brain/chinglishBook.js';

it('finds a short local book reference for noun plague', () => {
  const reference = findChinglishBookReference('noun_plague', 'Prefer a verb over a noun string');

  expect(reference).toEqual(expect.objectContaining({
    source: "The Translator's Guide to Chinglish",
    pattern: expect.stringContaining('Noun Plague'),
    quote: expect.stringContaining('real action'),
  }));
  expect(reference.quote!.split(/\s+/).length).toBeLessThanOrEqual(24);
});

it('returns a conservative status when no exact local quote is mapped', () => {
  const reference = findChinglishBookReference('modality', 'could/would for tentative claims');

  expect(reference).toEqual(expect.objectContaining({
    source: "The Translator's Guide to Chinglish",
    pattern: expect.stringContaining('Modality'),
    quoteStatus: 'No exact local book quote found for this pattern yet.',
  }));
  expect(reference.quote).toBeUndefined();
});
