import type { Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import type { createApp as CreateApp } from '../src/index.js';

const originalEnv = { ...process.env };
const USER_ID = 'access-user';

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

async function loadApp(accessCode?: string): Promise<typeof CreateApp> {
  process.env.IDIOMATE_ENV_FILE = 'missing-access-test-env';
  if (accessCode) process.env.ACCESS_CODE = accessCode;
  else delete process.env.ACCESS_CODE;
  vi.resetModules();
  const mod = await import('../src/index.js');
  return mod.createApp;
}

async function withServer<T>(app: ReturnType<typeof CreateApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

it('allows api requests without an access code when ACCESS_CODE is unset', async () => {
  const createApp = await loadApp();

  await withServer(createApp(), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': USER_ID },
    });

    expect(res.status).toBe(200);
  });
}, 10_000);

it('rejects api requests without the configured access code', async () => {
  const createApp = await loadApp('share-code');

  await withServer(createApp(), async baseUrl => {
    const missing = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': USER_ID },
    });
    const wrong = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': USER_ID, 'x-access-code': 'wrong-code' },
    });
    const correct = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': USER_ID, 'x-access-code': 'share-code' },
    });

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(correct.status).toBe(200);
  });
}, 10_000);
