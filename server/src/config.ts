import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.IDIOMATE_ENV_FILE ?? '.env', quiet: true });

export const config = {
  apiKey: process.env.OPENAI_API_KEY ?? '',
  modelCoach: process.env.OPENAI_MODEL_COACH ?? 'gpt-4o',
  modelUtility: process.env.OPENAI_MODEL_UTILITY ?? 'gpt-4o-mini',
  port: Number(process.env.PORT ?? 8787),
};
