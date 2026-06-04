import { describe, it, expect, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { openDb, migrate } from '../src/db/db.js';
import { getTallies } from '../src/db/dal.js';
import type { LLMProvider } from '../src/brain/provider.js';

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
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

it('POST /api/coach returns annotations without updating error tallies', async () => {
  const coachProvider: LLMProvider = {
    async complete() {
      return JSON.stringify({
        paragraphIndex: 0,
        annotations: [{
          span: 'in order to',
          errorType: 'redundancy',
          hint: 'Use fewer words.',
          explanation: 'Redundancy: this phrase is wordy.',
          modelRewrite: 'to',
        }],
      });
    },
  };

  await withServer(createApp({ db, coachProvider }), async baseUrl => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphIndex: 0, paragraph: 'We did X in order to Y.' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.annotations[0].errorType).toBe('redundancy');
    expect(getTallies(db)).toEqual([]);
  });
});
