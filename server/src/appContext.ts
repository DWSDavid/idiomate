import type Database from 'better-sqlite3';
import type { LLMProvider } from './brain/provider.js';

export interface AppDependencies {
  db: Database.Database;
  coachProvider: LLMProvider;
  utilityProvider: LLMProvider;
}
