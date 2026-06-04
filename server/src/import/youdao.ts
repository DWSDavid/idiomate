import type { Vocab, VocabKind } from '../../../shared/types.js';

const STATUS_MARKERS = [
  '未分组单词',
  '已掌握',
  '熟悉',
  '不熟',
  '已学习',
];

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le').replace(/^\ufeff/, '');
  }

  const utf8 = buf.toString('utf8');
  const nulCount = Array.from(utf8).filter(ch => ch === '\u0000').length;
  if (nulCount / Math.max(utf8.length, 1) > 0.05) {
    return buf.toString('utf16le').replace(/^\ufeff/, '');
  }

  return utf8.replace(/^\ufeff/, '');
}

function normalizeSpaces(text: string): string {
  return text.replace(/[ \t]+/g, ' ').trim();
}

function inferKind(word: string): VocabKind {
  const normalized = normalizeSpaces(word);
  if (normalized.includes(' ')) return 'phrase';
  return 'word';
}

function isStatusLine(line: string): boolean {
  return STATUS_MARKERS.includes(line);
}

function extractPos(lines: string[]): string | undefined {
  const tags = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^([A-Za-z]+\.)\s+/);
    if (match) tags.add(match[1]);
  }
  return tags.size ? Array.from(tags).join(' ') : undefined;
}

function parseHeader(header: string): { word: string; ipa?: string; direction?: string } | undefined {
  let rest = header.replace(/^\s*\d+\s*,\s*/, '').trim();
  let direction: string | undefined;

  const directionMatch = rest.match(/\s*([\u4e00-\u9fff]{1,3}译[\u4e00-\u9fff]{1,3})\s*$/u);
  if (directionMatch) {
    direction = directionMatch[1];
    rest = rest.slice(0, directionMatch.index).trim();
  }

  const ipaMatch = rest.match(/\[([^\]]*)\]\s*$/u);
  const ipa = ipaMatch?.[1].replace(/\s+/g, '').trim() || undefined;
  if (ipaMatch) {
    rest = rest.slice(0, ipaMatch.index).trim();
  }

  const word = normalizeSpaces(rest.replace(/[\uFFFC\u0000-\u001F]/g, ''));
  if (!word || /[\u4e00-\u9fff]/u.test(word)) return undefined;
  return { word, ipa, direction };
}

export function parseYoudaoTxt(buf: Buffer): Vocab[] {
  const text = decodeText(buf).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text
    .split(/(?=^\s*\d+\s*,)/m)
    .map(block => block.trim())
    .filter(Boolean);

  const vocab: Vocab[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(line => normalizeSpaces(line)).filter(Boolean);
    const parsed = parseHeader(lines[0]);
    if (!parsed) continue;

    const definitionLines = lines.slice(1).filter(line => !isStatusLine(line));
    const defCn = definitionLines.join(' ').replace(/\s+/g, ' ').trim();
    const status = lines.find(isStatusLine);

    vocab.push({
      word: parsed.word,
      normalized: parsed.word.toLowerCase(),
      kind: inferKind(parsed.word),
      ipa: parsed.ipa,
      defCn: defCn || undefined,
      pos: extractPos(definitionLines),
      status,
      source: 'youdao',
      direction: parsed.direction,
      captureCount: 1,
      timesSuggested: 0,
      timesUsed: 0,
    });
  }

  return vocab;
}
