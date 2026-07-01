import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

it('documents required production environment variables', () => {
  const envExample = read('.env.example');
  const readme = read('README.md');
  for (const name of [
    'OPENAI_API_KEY',
    'OPENAI_MODEL_COACH',
    'OPENAI_MODEL_UTILITY',
    'LLM_UTILITY_PROVIDER',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_MODEL_UTILITY',
    'ACCESS_CODE',
    'DB_PATH',
    'SEED_VOCAB_PATH',
    'PORT',
  ]) {
    expect(envExample).toContain(name);
    expect(readme).toContain(name);
  }
});

it('provides a Render Node host manifest with a persistent SQLite volume', () => {
  const manifest = read('render.yaml');
  expect(manifest).toContain('runtime: docker');
  expect(manifest).toContain('mountPath: /data');
  expect(manifest).toContain('DB_PATH');
  expect(manifest).toContain('/data/idiomate.sqlite');
  expect(manifest).toContain('SEED_VOCAB_PATH');
  expect(manifest).toContain('/app/server/seed/vocab.txt');
  expect(manifest.toLowerCase()).not.toContain('vercel');
});

it('explains how to share the private URL and access code with peers', () => {
  const readme = read('README.md');
  expect(readme).toContain('Share the Render URL and access code with peers');
  expect(readme).toContain('each peer enters a name');
});
