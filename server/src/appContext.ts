import type Database from 'better-sqlite3';
import type { LLMProvider } from './brain/provider.js';

export type HeadlineFetcher = (topic: string) => Promise<string[]>;

export interface AppDependencies {
  db: Database.Database;
  coachProvider: LLMProvider;
  utilityProvider: LLMProvider;
  headlineFetcher?: HeadlineFetcher;
}
