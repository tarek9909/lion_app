import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.string().default('3306').transform((val) => parseInt(val, 10)),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default('mysql'),
  DB_NAME: z.string().default('lion_delivery'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().default('lion_demo_jwt_secret_key_2026_super_secure'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('1092837465'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('lion_demo_verify_token_2026'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default('lion_demo_meta_app_secret_2026'),
  WHATSAPP_MODE: z.enum(['MOCK', 'LIVE']).default('MOCK'),
  MEDIA_MODE: z.enum(['MOCK', 'LIVE', 'FIXTURE']).default('FIXTURE'),
  TRANSCRIPTION_PROVIDER: z.enum(['WHISPER', 'FIXTURE']).default('FIXTURE'),
  VISION_PROVIDER: z.enum(['VISION_API', 'FIXTURE']).default('FIXTURE'),
  OPENAI_API_KEY: z.string().default(''),
  AI_PROVIDER: z.enum(['smart_nlu', 'gemini']).default('smart_nlu'),
  AI_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  LBP_PER_USD: z.string().default('89500').transform((val) => parseInt(val, 10)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  jwtSecret: env.JWT_SECRET,
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  redis: {
    url: env.REDIS_URL,
  },
  dashboardUrl: env.DASHBOARD_URL,
  whatsapp: {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    mode: env.WHATSAPP_MODE,
  },
  media: {
    mode: env.MEDIA_MODE,
    transcriptionProvider: env.TRANSCRIPTION_PROVIDER,
    visionProvider: env.VISION_PROVIDER,
    openAiApiKey: env.OPENAI_API_KEY,
  },
  ai: {
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
  },
  settlement: {
    lbpPerUsd: env.LBP_PER_USD,
  },
};

/**
 * Validate external service credentials at startup (G-053, G-054, G-061, G-062)
 */
export function validateStartupConfig(overrideConfig?: any): { whatsappValid: boolean; mediaValid: boolean; aiValid: boolean } {
  const targetConfig = overrideConfig || config;
  let whatsappValid = true;
  let mediaValid = true;
  let aiValid = true;

  if (targetConfig.whatsapp.mode === 'LIVE') {
    const token = targetConfig.whatsapp.accessToken;
    const phoneId = targetConfig.whatsapp.phoneNumberId;
    const hasToken = Boolean(token) && !token.startsWith('demo_') && token !== 'placeholder' && token !== 'your_meta_access_token_here' && token !== 'demo_whatsapp_access_token_placeholder';
    const hasPhoneId = Boolean(phoneId) && !phoneId.startsWith('demo_') && phoneId !== 'placeholder' && phoneId !== 'your_meta_phone_number_id_here' && phoneId !== 'demo_phone_number_id_placeholder';
    if (!hasToken || !hasPhoneId) {
      throw new Error(
        'Startup Error: WHATSAPP_MODE is set to LIVE but WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing or placeholder.'
      );
    }
  } else {
    console.log('[Startup Config] WhatsApp Mode: MOCK (Local simulator active)');
  }

  if (targetConfig.media.mode === 'LIVE') {
    if (targetConfig.media.transcriptionProvider === 'WHISPER' && (!targetConfig.media.openAiApiKey || targetConfig.media.openAiApiKey.startsWith('demo_') || targetConfig.media.openAiApiKey === 'placeholder')) {
      console.warn('[Startup Config] Warning: MEDIA_MODE is LIVE with WHISPER but OPENAI_API_KEY is not set or placeholder.');
      mediaValid = false;
    }
    if (targetConfig.media.visionProvider === 'VISION_API' && (!targetConfig.media.openAiApiKey || targetConfig.media.openAiApiKey.startsWith('demo_') || targetConfig.media.openAiApiKey === 'placeholder')) {
      console.warn('[Startup Config] Warning: MEDIA_MODE is LIVE with VISION_API but OPENAI_API_KEY is not set or placeholder.');
      mediaValid = false;
    }
  } else {
    console.log('[Startup Config] Media Mode: FIXTURE (Deterministic demo boundaries active)');
  }

  if (targetConfig.ai?.provider === 'gemini') {
    const geminiKey = targetConfig.ai.geminiApiKey;
    const hasGeminiKey = Boolean(geminiKey) &&
      !geminiKey.startsWith('demo_') &&
      geminiKey !== 'placeholder' &&
      geminiKey !== 'your_gemini_api_key_here' &&
      geminiKey !== 'demo_gemini_api_key_placeholder';
    if (!hasGeminiKey) {
      throw new Error(
        'Startup Error: AI_PROVIDER is set to gemini but GEMINI_API_KEY is missing or placeholder.'
      );
    }
  } else {
    console.log('[Startup Config] AI Provider: smart_nlu (Local deterministic chatbot active)');
  }

  return { whatsappValid, mediaValid, aiValid };
}
