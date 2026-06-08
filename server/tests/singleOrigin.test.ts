import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrate, openDb } from '../src/db/db.js';
import { createApp } from '../src/index.js';

let db: ReturnType<typeof openDb>;
let tempDir: string | undefined;
const USER_ID = 'local';

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  tempDir = mkdtempSync(join(tmpdir(), 'idiomate-dist-'));
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function withServer<T>(app: ReturnType<typeof createApp>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
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

it('serves built client assets and keeps api routes on the same origin', async () => {
  const clientDist = join(tempDir!, 'client-dist');
  mkdirSync(clientDist);
  writeFileSync(join(clientDist, 'index.html'), '<div id="root">Idiomate shell</div>');
  writeFileSync(join(clientDist, 'asset.txt'), 'built asset');

  await withServer(createApp({ db }, { clientDistPath: clientDist }), async baseUrl => {
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    await expect(root.text()).resolves.toContain('Idiomate shell');

    const asset = await fetch(`${baseUrl}/asset.txt`);
    expect(asset.status).toBe(200);
    await expect(asset.text()).resolves.toBe('built asset');

    const spaFallback = await fetch(`${baseUrl}/practice/session/123`);
    expect(spaFallback.status).toBe(200);
    await expect(spaFallback.text()).resolves.toContain('Idiomate shell');

    const api = await fetch(`${baseUrl}/api/vocab/list`, {
      headers: { 'x-user-id': USER_ID },
    });
    expect(api.status).toBe(200);

    const missingApi = await fetch(`${baseUrl}/api/not-real`, {
      headers: { 'x-user-id': USER_ID },
    });
    expect(missingApi.status).toBe(404);
    await expect(missingApi.text()).resolves.not.toContain('Idiomate shell');
  });
});
