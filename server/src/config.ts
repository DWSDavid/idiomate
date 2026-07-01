import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv({ path: process.env.IDIOMATE_ENV_FILE ?? '.env', quiet: true });

const here = dirname(fileURLToPath(import.meta.url));
const localDbPath = join(here, '../idiomate.sqlite');
const requestedUtilityProvider = process.env.LLM_UTILITY_PROVIDER?.toLowerCase();
const utilityProvider = requestedUtilityProvider === 'deepseek' || requestedUtilityProvider === 'openai'
  ? requestedUtilityProvider
  : process.env.DEEPSEEK_API_KEY
    ? 'deepseek'
    : 'openai';

export const config = {
  apiKey: process.env.OPENAI_API_KEY ?? '',
  modelCoach: process.env.OPENAI_MODEL_COACH ?? 'gpt-4o',
  modelUtility: utilityProvider === 'deepseek'
    ? process.env.DEEPSEEK_MODEL_UTILITY ?? 'deepseek-v4-flash'
    : process.env.OPENAI_MODEL_UTILITY ?? 'gpt-4o',
  utilityProvider,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? localDbPath,
  accessCode: process.env.ACCESS_CODE ?? '',
  seedVocabPath: process.env.SEED_VOCAB_PATH ?? '',
  autoSeedVocab: process.env.AUTO_SEED_VOCAB === 'true',
  ownerVocabCode: process.env.OWNER_VOCAB_CODE ?? process.env.RUBI_PROFILE_CODE ?? 'rubi-vocab',
  ownerVocabPath: process.env.OWNER_VOCAB_PATH ?? 'Vocabs.txt',
  rubiProfileCode: process.env.RUBI_PROFILE_CODE ?? process.env.OWNER_VOCAB_CODE ?? 'rubi-vocab',
  rubiProfileUserId: process.env.RUBI_PROFILE_USER_ID ?? 'rubi',
  rubiProfileName: process.env.RUBI_PROFILE_NAME ?? 'Rubi',
  adminCode: process.env.ADMIN_CODE ?? 'rubi-admin',
};
