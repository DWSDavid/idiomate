import { describe, expect, it } from 'vitest';
import { fetchHeadlines, fetchNews } from '../src/news.js';

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

it('fetches Google News RSS items with links and source names', async () => {
  let requestedUrl = '';
  const fetchImpl = async (url: string | URL) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async text() {
        return `
          <rss>
            <channel>
              <title>Google News - AI capex</title>
              <item>
                <title><![CDATA[Cloud firms raise AI spending - Example Wire]]></title>
                <link>https://news.google.com/articles/abc?hl=en-US&amp;gl=US</link>
                <source url="https://example.com">Example Wire</source>
              </item>
              <item>
                <title>Investors question margin pressure &amp; chip supply</title>
                <link><![CDATA[https://news.google.com/articles/def?hl=en-US&gl=US]]></link>
              </item>
            </channel>
          </rss>
        `;
      },
    };
  };

  const news = await fetchNews('AI capex', fetchImpl);

  expect(requestedUrl).toContain('q=AI%20capex');
  expect(news).toEqual([
    {
      title: 'Cloud firms raise AI spending - Example Wire',
      link: 'https://news.google.com/articles/abc?hl=en-US&gl=US',
      source: 'Example Wire',
    },
    {
      title: 'Investors question margin pressure & chip supply',
      link: 'https://news.google.com/articles/def?hl=en-US&gl=US',
      source: undefined,
    },
  ]);
});
