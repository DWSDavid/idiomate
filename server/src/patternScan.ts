import type Database from 'better-sqlite3';
import { rulePatternFrom, detectPreposition } from '../../shared/types.js';
import type { LLMProvider } from './brain/provider.js';
import { extractFixedCombos, type ExtractedCombo } from './brain/patterns.js';
import { buildPatternCue } from '../../shared/types.js';
import { countPatterns, getAllVocabForScan, insertPattern } from './db/dal.js';

const AI_BATCH_SIZE = 40;
const AI_CONCURRENCY = 4;

// Rule pass: harvest patterns already visible in the word or its collocations (free, exact).
function rulePatterns(words: string[]): Array<{ phrase: string; preposition: string; cue: string }> {
  const out: Array<{ phrase: string; preposition: string; cue: string }> = [];
  const seen = new Set<string>();
  for (const word of words) {
    const pattern = rulePatternFrom(word);
    if (pattern && !seen.has(pattern.phrase.toLowerCase())) {
      seen.add(pattern.phrase.toLowerCase());
      out.push(pattern);
    }
  }
  return out;
}

async function runBatches<T, R>(items: T[], size: number, concurrency: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const results: R[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const slice = batches.slice(i, i + concurrency);
    const settled = await Promise.all(slice.map(batch => fn(batch).catch(() => [] as R[])));
    for (const r of settled) results.push(...r);
  }
  return results;
}

function insertCombos(
  db: Database.Database,
  userId: string,
  combos: Array<{ phrase: string; preposition: string }>,
): void {
  for (const combo of combos) {
    insertPattern(db, userId, {
      phrase: combo.phrase,
      preposition: combo.preposition.toLowerCase(),
      cue: buildPatternCue(combo.phrase, combo.preposition),
    });
  }
}

export interface ScanResult {
  added: number;
  total: number;
}

// One-time backfill: rule-harvest every vocab word + collocation, then AI-detect fixed
// prepositions for the remaining bare words (register -> register for).
export async function scanVocabForPatterns(
  db: Database.Database,
  provider: LLMProvider,
  userId: string,
  model: string,
): Promise<ScanResult> {
  const before = countPatterns(db, userId);
  const vocab = getAllVocabForScan(db, userId);

  const rulePhrases = [
    ...vocab.map(v => v.word),
    ...vocab.flatMap(v => v.collocations ?? []),
  ];
  insertCombos(db, userId, rulePatterns(rulePhrases));

  // AI only needs the words that do NOT already contain a preposition.
  const bareWords = Array.from(new Set(
    vocab.map(v => v.word).filter(word => word.split(/\s+/).length <= 3 && !detectPreposition(word)),
  ));
  const combos = await runBatches<string, ExtractedCombo>(
    bareWords,
    AI_BATCH_SIZE,
    AI_CONCURRENCY,
    batch => extractFixedCombos(provider, { words: batch, model }),
  );
  insertCombos(db, userId, combos);

  const total = countPatterns(db, userId);
  return { added: total - before, total };
}

// Called on every vocab save: instantly bank a pattern if the saved word already contains a
// preposition (register for, brush up on). Free and synchronous, so it never slows or fails a
// save. Bare-word AI detection (register -> register for) is left to the Scan button, which is
// re-runnable and keeps saves cheap. Returns whether a pattern was added.
export function autoAddRulePattern(db: Database.Database, userId: string, word: string): boolean {
  const rule = rulePatternFrom(word);
  if (!rule) return false;
  insertPattern(db, userId, rule);
  return true;
}
