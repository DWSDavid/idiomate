export const NEWS_TOPICS = [
  'private equity',
  'humanoid robotics',
  'artificial intelligence',
  'financial markets',
  'geopolitics',
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
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetchImpl(url);
    if (response.ok === false) return [];
    const xml = await response.text();
    return parseTitles(xml).slice(1, 7);
  } catch {
    return [];
  }
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
