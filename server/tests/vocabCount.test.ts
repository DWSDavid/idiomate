import { describe, it, expect } from 'vitest';
import { countVocabUsed } from '../src/routes/sessions.js';

describe('countVocabUsed', () => {
  it('matches a multi-word phrase as a case-insensitive substring', () => {
    const result = countVocabUsed(
      ['crunch the numbers'],
      'I had to crunch the numbers carefully.',
    );
    expect(result).toBe(1);
  });

  it('matches words case-insensitively', () => {
    const result = countVocabUsed(
      ['Articulate'],
      'she was able to articulate her point well.',
    );
    expect(result).toBe(1);
  });

  it('counts only words that appear in the text', () => {
    const result = countVocabUsed(
      ['articulate', 'pivot', 'leverage'],
      'She managed to articulate the idea clearly.',
    );
    expect(result).toBe(1);
  });

  it('searches in finalText as well as draftText', () => {
    const result = countVocabUsed(
      ['nuance'],
      'The draft had no special terms.',
      'The final text adds nuance.',
    );
    expect(result).toBe(1);
  });

  it('returns 0 when primedVocab is empty', () => {
    const result = countVocabUsed([], 'Some text here.');
    expect(result).toBe(0);
  });

  it('returns 0 when no primed words appear in the text', () => {
    const result = countVocabUsed(
      ['ephemeral', 'paradigm'],
      'The quick brown fox jumps over the lazy dog.',
    );
    expect(result).toBe(0);
  });

  it('counts all matching words correctly', () => {
    const result = countVocabUsed(
      ['crunch the numbers', 'big picture', 'leverage'],
      'We need to crunch the numbers and see the big picture.',
    );
    expect(result).toBe(2);
  });
});
