import { afterEach, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from '../src/brain/deepseek.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

it('calls the DeepSeek chat API using the OpenAI-compatible JSON contract', async () => {
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> | undefined;
  let capturedHeaders: Headers | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init.headers);
    capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 });
  }) as typeof fetch;

  const provider = new DeepSeekProvider('deepseek-test-key', { baseUrl: 'https://deepseek.example/' });
  const result = await provider.complete({
    system: 'Return JSON.',
    user: 'Check this.',
    model: 'deepseek-v4-flash',
  });

  expect(result).toBe('{"ok":true}');
  expect(capturedUrl).toBe('https://deepseek.example/chat/completions');
  expect(capturedHeaders?.get('Authorization')).toBe('Bearer deepseek-test-key');
  expect(capturedBody?.model).toBe('deepseek-v4-flash');
  expect(capturedBody?.response_format).toEqual({ type: 'json_object' });
  expect(capturedBody?.thinking).toEqual({ type: 'disabled' });
});

it('surfaces DeepSeek request failures with provider-specific errors', async () => {
  globalThis.fetch = (async () => new Response('bad key', { status: 401 })) as typeof fetch;

  const provider = new DeepSeekProvider('bad-key');

  await expect(provider.complete({
    system: 'Return JSON.',
    user: 'Check this.',
    model: 'deepseek-v4-flash',
  })).rejects.toThrow('DeepSeek request failed: 401 bad key');
});
