import type Database from 'better-sqlite3';
import type { EmbeddingProvider } from './brain/embedding.js';
import type { LLMProvider } from './brain/provider.js';
import type { NewsItem } from '../../shared/types.js';

export type HeadlineFetcher = (topic: string) => Promise<string[]>;
export type NewsFetcher = (query: string) => Promise<NewsItem[]>;
export type ArticleTextFetcher = (url: string) => Promise<string>;

export interface AppDependencies {
  db: Database.Database;
  coachProvider: LLMProvider;
  utilityProvider: LLMProvider;
  embeddingProvider?: EmbeddingProvider;
  headlineFetcher?: HeadlineFetcher;
  newsFetcher?: NewsFetcher;
  articleFetcher?: ArticleTextFetcher;
}
