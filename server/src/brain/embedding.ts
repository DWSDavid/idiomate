export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

export function retrieveTopK(
  stored: Array<{ sessionId: number; content: string; embedding: number[] }>,
  queryEmbedding: number[],
  k = 3,
): Array<{ sessionId: number; content: string; score: number }> {
  return stored
    .map(s => ({ sessionId: s.sessionId, content: s.content, score: cosineSimilarity(queryEmbedding, s.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
