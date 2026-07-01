import type { NewsItem } from '../../shared/types.js';

export const NEWS_TOPICS = [
  'private equity',
  'artificial intelligence',
  'consumer technology',
  'climate technology',
  'financial markets',
  'healthcare innovation',
  'education technology',
  'media and creator economy',
  'supply chains',
  'urban life',
  'personal finance',
  'management decisions',
  'technology policy',
] as const;

type FetchLike = (url: string | URL) => Promise<{
  ok?: boolean;
  status?: number;
  text(): Promise<string>;
}>;

export async function fetchHeadlines(
  topic: string,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  try {
    const url = googleNewsUrl(topic);
    const response = await fetchImpl(url);
    if (response.ok === false) return [];
    const xml = await response.text();
    return parseTitles(xml).slice(1, 7);
  } catch {
    return [];
  }
}

export async function fetchNews(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<NewsItem[]> {
  try {
    const response = await fetchImpl(googleNewsUrl(query));
    if (response.ok === false) return [];
    const xml = await response.text();
    return parseNewsItems(xml).slice(0, 6);
  } catch {
    return [];
  }
}

// Best-effort: fetch a source article and return readable plain text. Google News RSS links
// redirect to the publisher (fetch follows redirects) and many outlets are paywalled, so this
// can legitimately return '' — callers must degrade gracefully rather than depend on it.
export async function fetchArticleText(
  url: string,
  fetchImpl: FetchLike = fetch,
  maxChars = 6000,
): Promise<string> {
  try {
    const response = await fetchImpl(url);
    if (response.ok === false) return '';
    const html = await response.text();
    return htmlToText(html).slice(0, maxChars);
  } catch {
    return '';
  }
}

export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return decodeXml(withoutBlocks.replace(/<[^>]+>/g, ' '))
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function googleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function parseTitles(xml: string): string[] {
  const titles: string[] = [];
  const titleRe = /<title>([\s\S]*?)<\/title>/gi;
  let match: RegExpExecArray | null;
  while ((match = titleRe.exec(xml)) !== null) {
    const title = stripCdata(match[1]).trim();
    if (title) titles.push(decodeXml(title));
  }
  return titles;
}

function parseNewsItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[0];
    const title = readTag(block, 'title');
    const link = readTag(block, 'link');
    if (!title || !link) continue;
    items.push({
      title,
      link,
      source: readTag(block, 'source') || undefined,
    });
  }
  return items;
}

function readTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  const value = match?.[1];
  if (!value) return undefined;
  return decodeXml(stripCdata(value).trim());
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
