import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseYoudaoTxt } from '../src/import/youdao.js';

const fixtureText = readFileSync(new URL('./fixtures/youdao-sample.txt', import.meta.url), 'utf8');

it('parses words, ipa, cn definition, and phrase kind from real entries', () => {
  const vocab = parseYoudaoTxt(Buffer.from(fixtureText, 'utf8'));

  expect(vocab.length).toBe(8);
  const esoteric = vocab.find(v => v.word === 'esoteric');
  expect(esoteric).toBeDefined();
  expect(esoteric!.ipa).toBe('ˌiːsəˈterɪk');
  expect(esoteric!.defCn).toContain('内行');

  const shoreUp = vocab.find(v => v.word === 'shore up');
  expect(shoreUp).toBeDefined();
  expect(shoreUp!.kind).toBe('phrase');
  expect(shoreUp!.defCn).toContain('支撑');

  expect(vocab.find(v => v.word === '拍马屁')).toBeUndefined();

  const rusty = vocab.find(v => v.word === 'rusty');
  expect(rusty).toBeDefined();
  expect(rusty!.defCn).toContain('生疏');
  expect(rusty!.defCn).toContain('不熟练');

  const timely = vocab.find(v => v.word === 'timely matter');
  expect(timely).toBeDefined();
  expect(timely!.normalized).toBe('timely matter');
  expect(timely!.direction).toBe('英译英');
  expect(timely!.defCn).toContain('handled promptly');
});

it('parses generic direction markers and drops non-English headwords', () => {
  const text = [
    '1, alpha object\uFFFC  [a l f a]  法译英',
    'definition in English',
    '未分组单词',
    '2, 拍马屁  [pāi mǎ pì]  中译英',
    "lick sb's boots",
    '未分组单词',
  ].join('\n');
  const vocab = parseYoudaoTxt(Buffer.from(text, 'utf8'));

  expect(vocab).toHaveLength(1);
  expect(vocab[0].word).toBe('alpha object');
  expect(vocab[0].ipa).toBe('alfa');
  expect(vocab[0].direction).toBe('法译英');
});

it('handles the real UTF-16LE export without mojibake or NULs', () => {
  const buf = Buffer.from(`\ufeff${fixtureText}`, 'utf16le');
  const vocab = parseYoudaoTxt(buf);

  expect(vocab).toHaveLength(8);
  expect(vocab.every(v => !v.word.includes('\u0000'))).toBe(true);
  expect(vocab.find(v => v.word === 'kick the can down the road')!.defCn).toContain('拖延问题');
});
