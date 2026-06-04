import { describe, expect, it } from 'vitest';
import { fetchHeadlines } from '../src/news.js';

it('fetches Google News RSS headlines for an encoded topic', async () => {
  let requestedUrl = '';
  const fetchImpl = async (url: string | URL) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async text() {
        return `
          <rss>
            <channel>
              <title>Google News - humanoid robotics</title>
              <item><title><![CDATA[Humanoid robots enter warehouses - Example]]></title></item>
              <item><title>Robotics firms &amp; chipmakers strike new deals</title></item>
            </channel>
          </rss>
        `;
      },
    };
  };

  const headlines = await fetchHeadlines('humanoid robotics', fetchImpl);

  expect(requestedUrl).toContain('q=humanoid%20robotics');
  expect(headlines).toEqual([
    'Humanoid robots enter warehouses - Example',
    'Robotics firms & chipmakers strike new deals',
  ]);
});

it('returns an empty list when the RSS request fails', async () => {
  const headlines = await fetchHeadlines('financial markets', async () => {
    throw new Error('offline');
  });

  expect(headlines).toEqual([]);
});
