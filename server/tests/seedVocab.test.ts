import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
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

async function withServer<T>(app: ReturnType<typeof import('../src/index.js').createApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
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

it('copies seed vocabulary to each new user without sharing later mutations', async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-seed-'));
  const seedPath = join(tempDir, 'seed-vocab.txt');
  writeFileSync(seedPath, [
    '1, risk premium',
    'n. the extra return investors demand for taking risk',
    '',
    '2, shore up',
    'v. support or strengthen something under pressure',
  ].join('\n'));
  process.env.IDIOMATE_ENV_FILE = join(tempDir, 'missing.env');
  process.env.SEED_VOCAB_PATH = seedPath;
  process.env.AUTO_SEED_VOCAB = 'true';
  vi.resetModules();

  const { createApp } = await import('../src/index.js');
  await withServer(createApp(), async baseUrl => {
    const aliceList = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': 'alice', 'x-user-name': 'Alice' },
    });
    expect(aliceList.status).toBe(200);
    await expect(aliceList.json()).resolves.toEqual({
      total: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ word: 'risk premium' }),
        expect.objectContaining({ word: 'shore up' }),
      ]),
    });

    await fetch(`${baseUrl}/api/vocab/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'alice' },
      body: JSON.stringify({ word: 'risk premium', kind: 'phrase' }),
    });

    const bobList = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': 'bob', 'x-user-name': 'Bob' },
    });
    expect(bobList.status).toBe(200);
    const bobJson = await bobList.json();
    expect(bobJson.total).toBe(2);
    expect(bobJson.items.find((item: { word: string }) => item.word === 'risk premium')).toEqual(
      expect.objectContaining({ captureCount: 1 }),
    );
  });
}, 10_000);
