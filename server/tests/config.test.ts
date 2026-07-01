import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    'LLM_UTILITY_PROVIDER=openai',
    `DB_PATH=${join(tempDir, 'mounted.sqlite')}`,
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
  expect(config.utilityProvider).toBe('openai');
  expect(config.dbPath).toBe(join(tempDir, 'mounted.sqlite'));
  expect(config.port).toBe(9876);
});

it('switches utility work to DeepSeek when a DeepSeek key is present', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-env-'));
  const envFile = join(tempDir, '.env');
  writeFileSync(envFile, [
    'OPENAI_API_KEY=sk-test-from-env-file',
    'OPENAI_MODEL_COACH=coach-env-file',
    'OPENAI_MODEL_UTILITY=utility-env-file',
    'DEEPSEEK_API_KEY=deepseek-test-key',
    'DEEPSEEK_MODEL_UTILITY=deepseek-test-model',
    'DEEPSEEK_BASE_URL=https://deepseek.example',
  ].join('\n'));

  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL_COACH;
  delete process.env.OPENAI_MODEL_UTILITY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL_UTILITY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.LLM_UTILITY_PROVIDER;
  process.env.IDIOMATE_ENV_FILE = envFile;
  vi.resetModules();

  const { config } = await import('../src/config.js');

  expect(config.modelCoach).toBe('coach-env-file');
  expect(config.utilityProvider).toBe('deepseek');
  expect(config.modelUtility).toBe('deepseek-test-model');
  expect(config.deepseekApiKey).toBe('deepseek-test-key');
  expect(config.deepseekBaseUrl).toBe('https://deepseek.example');
});

it('can force utility work back to OpenAI even when a DeepSeek key exists', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-env-'));
  const envFile = join(tempDir, '.env');
  writeFileSync(envFile, [
    'OPENAI_MODEL_UTILITY=utility-env-file',
    'LLM_UTILITY_PROVIDER=openai',
    'DEEPSEEK_API_KEY=deepseek-test-key',
    'DEEPSEEK_MODEL_UTILITY=deepseek-test-model',
  ].join('\n'));

  delete process.env.OPENAI_MODEL_UTILITY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL_UTILITY;
  delete process.env.LLM_UTILITY_PROVIDER;
  process.env.IDIOMATE_ENV_FILE = envFile;
  vi.resetModules();

  const { config } = await import('../src/config.js');

  expect(config.utilityProvider).toBe('openai');
  expect(config.modelUtility).toBe('utility-env-file');
});

it('defaults both model tiers to gpt-4o when not overridden', async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL_COACH;
  delete process.env.OPENAI_MODEL_UTILITY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.LLM_UTILITY_PROVIDER;
  delete process.env.PORT;
  process.env.IDIOMATE_ENV_FILE = join(tmpdir(), 'idiomate-missing-env-file');
  vi.resetModules();

  const { config } = await import('../src/config.js');

  expect(config.modelCoach).toBe('gpt-4o');
  expect(config.modelUtility).toBe('gpt-4o');
  expect(config.utilityProvider).toBe('openai');
  expect(config.dbPath).toBe(join(dirname(fileURLToPath(import.meta.url)), '../idiomate.sqlite'));
});

it('creates the database parent directory when DB_PATH points to a mounted path', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-dbpath-'));
  const dbPath = join(tempDir, 'data', 'idiomate.sqlite');
  delete process.env.OPENAI_API_KEY;
  process.env.DB_PATH = dbPath;
  process.env.IDIOMATE_ENV_FILE = join(tmpdir(), 'idiomate-missing-env-file');
  vi.resetModules();

  const { openDb } = await import('../src/db/db.js');
  const db = openDb();
  db.close();

  expect(existsSync(dbPath)).toBe(true);
});
