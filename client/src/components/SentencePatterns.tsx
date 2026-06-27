import React from 'react';

type PartRole = 'subject' | 'verb' | 'object' | 'adjective' | 'adverb' | 'clause' | 'prep-phrase' | 'conjunction';

interface SentencePart {
  text: string;
  role: PartRole;
  label: string;
}

interface SentencePattern {
  id: string;
  name: string;
  formula: string;
  parts: Array<SentencePart | string>;
  tip: string;
}

const PATTERNS: SentencePattern[] = [
  {
    id: 'simple',
    name: 'Simple assertion',
    formula: 'S + V + O',
    parts: [
      { text: 'The company', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'launched', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'a new product', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '最基础结构，适合陈述事实。主语 + 动作 + 对象。',
  },
  {
    id: 'causal',
    name: 'Causal chain',
    formula: 'S + V + O, which + V + O',
    parts: [
      { text: 'The decision', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'cut', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'costs', role: 'object', label: '宾语 object' },
      ', ',
      { text: 'which', role: 'conjunction', label: '关系代词 — 引导结果从句' },
      ' ',
      { text: 'boosted', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'margins', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '用 which 引导结果从句，避免堆砌 and。前因后果，一气呵成。',
  },
  {
    id: 'concession',
    name: 'Concession + pivot',
    formula: 'Although + clause, S + V + O',
    parts: [
      { text: 'Although', role: 'conjunction', label: '让步连词' },
      ' ',
      { text: 'growth slowed', role: 'clause', label: '让步从句 concession clause' },
      ', ',
      { text: 'the firm', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'maintained', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'profitability', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: '先承认不利面，再转折。显得客观有说服力。',
  },
  {
    id: 'fronted-adv',
    name: 'Fronted adverb',
    formula: 'Adv + , + S + V + O',
    parts: [
      { text: 'Historically', role: 'adverb', label: '副词 adverb — 时间维度' },
      ', ',
      { text: 'markets', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'recover', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'faster than expected', role: 'prep-phrase', label: '程度短语' },
      '.',
    ],
    tip: '副词前置强调时间 / 方式。比 "Markets historically recover" 更有重量感。',
  },
  {
    id: 'subject-complement',
    name: 'Subject complement',
    formula: 'S + linking-V + Adj',
    parts: [
      { text: 'The outlook', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'remains', role: 'verb', label: '系动词 linking verb' },
      ' ',
      { text: 'uncertain', role: 'adjective', label: '表语 predicate adjective' },
      '.',
    ],
    tip: 'remain / become / seem + 形容词，描述主语的状态变化。',
  },
  {
    id: 'parallel',
    name: 'Parallel list',
    formula: 'S + V + O₁, O₂, and O₃',
    parts: [
      { text: 'The strategy', role: 'subject', label: '主语 subject' },
      ' ',
      { text: 'prioritises', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'speed', role: 'object', label: '宾语1' },
      ', ',
      { text: 'cost efficiency', role: 'object', label: '宾语2' },
      ', and ',
      { text: 'scalability', role: 'object', label: '宾语3 — 最重要放最后' },
      '.',
    ],
    tip: '三项并列结构对称有力。最后一项最重要，读者印象最深。',
  },
  {
    id: 'conditional',
    name: 'Conditional',
    formula: 'If + clause, S + will/would + V + O',
    parts: [
      { text: 'If', role: 'conjunction', label: '条件连词' },
      ' ',
      { text: 'demand holds', role: 'clause', label: '条件从句 condition clause' },
      ', ',
      { text: 'revenue', role: 'subject', label: '主语 subject' },
      ' will ',
      { text: 'exceed', role: 'verb', label: '谓语 verb' },
      ' ',
      { text: 'targets', role: 'object', label: '宾语 object' },
      '.',
    ],
    tip: 'will 用于现实可能；would 用于假设或反事实。条件放前，结果放后。',
  },
  {
    id: 'passive',
    name: 'Passive emphasis',
    formula: 'O + be + V(past) + by + Agent',
    parts: [
      { text: 'The policy', role: 'subject', label: '被动主语 (原宾语)' },
      ' was ',
      { text: 'shaped', role: 'verb', label: '被动谓语 past participle' },
      ' ',
      { text: 'by a decade of low rates', role: 'prep-phrase', label: '施动者短语 by-phrase' },
      '.',
    ],
    tip: '被动语态把结果放句首，强调影响而非施动者。财经写作常用。',
  },
];

function renderParts(parts: SentencePattern['parts']): React.ReactNode {
  return parts.map((part, index) => {
    if (typeof part === 'string') {
      return <span key={index}>{part}</span>;
    }
    return (
      <span
        key={index}
        className={`part-${part.role}`}
        title={part.label}
      >
        {part.text}
      </span>
    );
  });
}

export function SentencePatterns() {
  return (
    <section className="surface" aria-label="sentence patterns">
      <span className="section-label">Sentence patterns</span>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Eight core structures for professional English. Hover a coloured part to see its role in Chinese.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {PATTERNS.map(pattern => (
          <div key={pattern.id} className="rounded-2xl border border-stone-200 bg-stone-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{pattern.name}</span>
              <span className="chip text-xs font-mono">{pattern.formula}</span>
            </div>
            <p className="mt-3 font-serif text-base leading-8">
              {renderParts(pattern.parts)}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pattern.tip}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          { role: 'subject', label: '主语 subject' },
          { role: 'verb', label: '谓语 verb' },
          { role: 'object', label: '宾语 object' },
          { role: 'adjective', label: '形容词 adjective' },
          { role: 'adverb', label: '副词 adverb' },
          { role: 'clause', label: '从句 clause' },
          { role: 'prep-phrase', label: '介词短语 prep phrase' },
        ].map(({ role, label }) => (
          <span key={role} className={`part-${role}`}>{label}</span>
        ))}
      </div>
    </section>
  );
}
