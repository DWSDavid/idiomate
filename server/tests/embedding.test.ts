import { expect, it } from 'vitest';
import { cosineSimilarity, retrieveTopK } from '../src/brain/embedding.js';

it('returns 1 for identical vectors and 0 for orthogonal vectors', () => {
  expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
});

it('retrieves the top ranked embedded sessions by cosine similarity', () => {
  const results = retrieveTopK([
    { sessionId: 1, content: 'cash flow planning', embedding: [1, 0] },
    { sessionId: 2, content: 'model deployment', embedding: [0, 1] },
    { sessionId: 3, content: 'cash runway', embedding: [0.9, 0.1] },
  ], [1, 0], 2);

  expect(results.map(result => result.sessionId)).toEqual([1, 3]);
  expect(results[0]).toEqual(expect.objectContaining({
    content: 'cash flow planning',
    score: 1,
  }));
});
