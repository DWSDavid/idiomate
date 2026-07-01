import { describe, expect, it } from 'vitest';
import { fetchArticleText, fetchHeadlines, fetchNews, htmlToText } from '../src/news.js';

it('strips scripts, styles, and tags into readable text', () => {
  const html = `
    <html><head><style>.a{color:red}</style><script>alert(1)</script></head>
    <body><h1>Rollout under scrutiny</h1><p>Adoption doubled &amp; risks grew.</p></body></html>
  `;

  const text = htmlToText(html);

  expect(text).toContain('Rollout under scrutiny');
  expect(text).toContain('Adoption doubled & risks grew.');
  expect(text).not.toContain('alert(1)');
  expect(text).not.toContain('color:red');
});

it('returns article text and degrades to empty on fetch failure', async () => {
  const ok = await fetchArticleText('https://example.com/a', async () => ({
    ok: true,
    async text() {
      return '<article><p>Regulators warned the rollout was rushed.</p></article>';
    },
  }));
  expect(ok).toContain('Regulators warned the rollout was rushed.');

  const failed = await fetchArticleText('https://example.com/b', async () => {
    throw new Error('paywalled');
  });
  expect(failed).toBe('');
});

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
