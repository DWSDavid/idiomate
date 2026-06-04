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

export function parseYoudaoTxt(buf: Buffer): Vocab[] {
  const text = decodeText(buf).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text
    .split(/(?=^\s*\d+\s*,)/m)
    .map(block => block.trim())
    .filter(Boolean);

  const vocab: Vocab[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(line => normalizeSpaces(line)).filter(Boolean);
    const header = lines[0];
    const match = header.match(/^\s*\d+\s*,\s*(.*?)\s*(?:\[([^\]]*)\])?\s*(?:英译中|中译英|$)/u);
    if (!match) continue;

    const word = normalizeSpaces(match[1]);
    if (!word) continue;

    const definitionLines = lines.slice(1).filter(line => !isStatusLine(line));
    const defCn = definitionLines.join(' ').replace(/\s+/g, ' ').trim();
    const status = lines.find(isStatusLine);

    vocab.push({
      word,
      normalized: word.toLowerCase(),
      kind: inferKind(word),
      ipa: match[2]?.replace(/\s+/g, '').trim() || undefined,
      defCn: defCn || undefined,
      pos: extractPos(definitionLines),
      status,
      source: 'youdao',
      captureCount: 1,
      timesSuggested: 0,
      timesUsed: 0,
    });
  }

  return vocab;
}
