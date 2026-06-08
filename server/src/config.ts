import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv({ path: process.env.IDIOMATE_ENV_FILE ?? '.env', quiet: true });

const here = dirname(fileURLToPath(import.meta.url));
const localDbPath = join(here, '../idiomate.sqlite');

export const config = {
  apiKey: process.env.OPENAI_API_KEY ?? '',
  modelCoach: process.env.OPENAI_MODEL_COACH ?? 'gpt-4o',
  modelUtility: process.env.OPENAI_MODEL_UTILITY ?? 'gpt-4o',
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? localDbPath,
};
