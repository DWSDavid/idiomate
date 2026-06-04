import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };
let tempDir: string | undefined;

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
  vi.resetModules();
});

it('loads OpenAI settings from a local env file before building config', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-env-'));
  const envFile = join(tempDir, '.env');
  writeFileSync(envFile, [
    'OPENAI_API_KEY=sk-test-from-env-file',
    'OPENAI_MODEL_COACH=coach-env-file',
    'OPENAI_MODEL_UTILITY=utility-env-file',
    'PORT=9876',
  ].join('\n'));

  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL_COACH;
  delete process.env.OPENAI_MODEL_UTILITY;
  delete process.env.PORT;
  process.env.IDIOMATE_ENV_FILE = envFile;
  vi.resetModules();

  const { config } = await import('../src/config.js');

  expect(config.apiKey).toBe('sk-test-from-env-file');
  expect(config.modelCoach).toBe('coach-env-file');
  expect(config.modelUtility).toBe('utility-env-file');
  expect(config.port).toBe(9876);
});

it('defaults both model tiers to gpt-4o when not overridden', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL_COACH;
  delete process.env.OPENAI_MODEL_UTILITY;
  delete process.env.PORT;
  process.env.IDIOMATE_ENV_FILE = join(tmpdir(), 'idiomate-missing-env-file');
  vi.resetModules();

  const { config } = await import('../src/config.js');

  expect(config.modelCoach).toBe('gpt-4o');
  expect(config.modelUtility).toBe('gpt-4o');
});
