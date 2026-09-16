import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.string().default('4050').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.string().default('3306').transform((val) => parseInt(val, 10)),
  DB_USER: z.string().default('root'),
  // Windows omits an empty process environment value. The explicit sentinel
  // keeps local disposable-test runs able to target passwordless MySQL.
  DB_PASSWORD: z.string().default('mysql').transform((value) => value === '__NO_PASSWORD__' ? '' : value),
  DB_NAME: z.string().default('lion_delivery'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  DASHBOARD_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().default('lion_demo_jwt_secret_key_2026_super_secure'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('1092837465'),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v25.0'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('lion_demo_verify_token_2026'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default('lion_demo_meta_app_secret_2026'),
  WHATSAPP_MODE: z.enum(['MOCK', 'LIVE']).default('MOCK'),
  MEDIA_MODE: z.enum(['MOCK', 'LIVE', 'FIXTURE']).default('FIXTURE'),
  TRANSCRIPTION_PROVIDER: z.enum(['WHISPER', 'FIXTURE']).default('FIXTURE'),
  VISION_PROVIDER: z.enum(['VISION_API', 'FIXTURE']).default('FIXTURE'),
  OPENAI_API_KEY: z.string().default(''),
  AI_PROVIDER: z.enum(['smart_nlu', 'gemini']).default('gemini'),
  AI_ROUTING_MODE: z.enum(['STABLE_ONLY', 'SHADOW', 'CANARY', 'CANDIDATE_ONLY']).default('STABLE_ONLY'),
  AI_STABLE_PROVIDER: z.enum(['smart_nlu', 'gemini']).default('gemini'),
  AI_CANDIDATE_PROVIDER: z.enum(['smart_nlu', 'gemini']).default('gemini'),
  AI_CANARY_PERCENTAGE: z.string().default('0').transform((val) => Math.max(0, Math.min(100, parseInt(val, 10) || 0))),
  AI_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_MAX_OUTPUT_TOKENS: z.string().default('600').transform((val) => Math.max(256, Math.min(2000, parseInt(val, 10) || 600))),
  GEMINI_REQUEST_TIMEOUT_MS: z.string().default('120000').transform((val) => parseInt(val, 10)),
  WHATSAPP_WORKER_POLL_MS: z.string().default('750').transform((val) => parseInt(val, 10)),
  WHATSAPP_WORKER_MAX_RETRIES: z.string().default('3').transform((val) => parseInt(val, 10)),
  WHATSAPP_WORKER_STALE_SECONDS: z.string().default('600').transform((val) => parseInt(val, 10)),
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
    graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION,
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
    geminiMaxOutputTokens: env.GEMINI_MAX_OUTPUT_TOKENS,
    geminiRequestTimeoutMs: env.GEMINI_REQUEST_TIMEOUT_MS,
    routingMode: env.AI_ROUTING_MODE,
    stableProvider: env.AI_STABLE_PROVIDER,
    candidateProvider: env.AI_CANDIDATE_PROVIDER,
    canaryPercentage: env.AI_CANARY_PERCENTAGE,
    // AI_PROVIDER is a legacy single-provider setting. Routing fields only
    // become authoritative when the operator explicitly supplies one.
    routingConfigured: Boolean(
      process.env.AI_ROUTING_MODE ||
      process.env.AI_STABLE_PROVIDER ||
      process.env.AI_CANDIDATE_PROVIDER ||
      process.env.AI_CANARY_PERCENTAGE
    ),
    providerConfigured: Boolean(process.env.AI_PROVIDER),
  },
  whatsappWorker: {
    pollMs: env.WHATSAPP_WORKER_POLL_MS,
    maxRetries: env.WHATSAPP_WORKER_MAX_RETRIES,
    staleSeconds: env.WHATSAPP_WORKER_STALE_SECONDS,
  },
  settlement: {
    lbpPerUsd: env.LBP_PER_USD,
  },
};

export interface ResolvedAIRoutingConfig {
  stableProvider: 'smart_nlu' | 'gemini';
  candidateProvider: 'smart_nlu' | 'gemini';
  routingMode: 'STABLE_ONLY' | 'SHADOW' | 'CANARY' | 'CANDIDATE_ONLY';
  canaryPercentage: number;
}

/**
 * Resolve the exact routing configuration used at runtime and startup.
 * Legacy AI_PROVIDER remains supported, but cannot silently disagree with an
 * explicitly configured routing graph.
 */
export function resolveAIRoutingConfig(ai: any): ResolvedAIRoutingConfig {
  const provider = ai?.provider as 'smart_nlu' | 'gemini' | undefined;
  const explicitlyConfigured =
    ai?.routingConfigured !== undefined
      ? ai.routingConfigured === true
      : ['routingMode', 'stableProvider', 'candidateProvider', 'canaryPercentage'].some((key) =>
          Object.prototype.hasOwnProperty.call(ai || {}, key)
        );

  if (!explicitlyConfigured) {
    return {
      stableProvider: provider || 'gemini',
      candidateProvider: 'gemini',
      routingMode: 'STABLE_ONLY',
      canaryPercentage: 0,
    };
  }

  const stableProvider = (ai?.stableProvider || provider || 'gemini') as 'smart_nlu' | 'gemini';
  if (provider && provider !== stableProvider) {
    throw new Error(
      `Startup Error: AI_PROVIDER=${provider} conflicts with AI_STABLE_PROVIDER=${stableProvider}. Set one provider graph explicitly.`
    );
  }

  return {
    stableProvider,
    candidateProvider: (ai?.candidateProvider || 'gemini') as 'smart_nlu' | 'gemini',
    routingMode: (ai?.routingMode || 'STABLE_ONLY') as ResolvedAIRoutingConfig['routingMode'],
    canaryPercentage: Number(ai?.canaryPercentage || 0),
  };
}

/**
 * Validate external service credentials at startup (G-053, G-054, G-061, G-062)
 */
export interface StartupValidationOptions {
  /**
   * Lets the process connect to the database before validating the WhatsApp
   * token. This is needed when the active token is stored encrypted in the
   * dashboard settings instead of in the environment.
   */
  deferWhatsAppCredential?: boolean;
}

export function validateWhatsAppRuntimeCredential(accessToken: string | undefined, targetConfig: any = config): boolean {
  if (targetConfig.whatsapp.mode !== 'LIVE') return true;

  const token = accessToken || '';
  const phoneId = targetConfig.whatsapp.phoneNumberId;
  const hasToken = Boolean(token) && !token.startsWith('demo_') && token !== 'placeholder' && token !== 'your_meta_access_token_here' && token !== 'demo_whatsapp_access_token_placeholder';
  const hasPhoneId = Boolean(phoneId) && !phoneId.startsWith('demo_') && phoneId !== 'placeholder' && phoneId !== 'your_meta_phone_number_id_here' && phoneId !== 'demo_phone_number_id_placeholder';
  if (!hasToken || !hasPhoneId) {
    throw new Error(
      'Startup Error: WHATSAPP_MODE is set to LIVE but no valid WhatsApp access token or phone number ID is configured.'
    );
  }

  return true;
}

export function validateStartupConfig(
  overrideConfig?: any,
  options: StartupValidationOptions = {},
): { whatsappValid: boolean; mediaValid: boolean; aiValid: boolean } {
  const targetConfig = overrideConfig || config;
  let whatsappValid = true;
  let mediaValid = true;
  let aiValid = true;

  if (targetConfig.whatsapp.mode === 'LIVE') {
    if (!options.deferWhatsAppCredential) {
      validateWhatsAppRuntimeCredential(targetConfig.whatsapp.accessToken, targetConfig);
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

  const resolvedRouting = resolveAIRoutingConfig(targetConfig.ai || {});
  const aiRoutingMode = resolvedRouting.routingMode;
  const stableProvider = resolvedRouting.stableProvider;
  const candidateProvider = resolvedRouting.candidateProvider;
  const canaryPct = resolvedRouting.canaryPercentage;

  if (targetConfig.nodeEnv === 'production' && (stableProvider !== 'gemini' || candidateProvider !== 'gemini')) {
    throw new Error('Startup Error: production AI routing is Gemini-only. Set AI_STABLE_PROVIDER=gemini and AI_CANDIDATE_PROVIDER=gemini.');
  }

  const isGeminiKeyValid = (key?: string): boolean =>
    Boolean(
      key &&
      !key.startsWith('demo_') &&
      key !== 'placeholder' &&
      key !== 'your_gemini_api_key_here' &&
      key !== 'demo_gemini_api_key_placeholder'
    );

  const geminiHasKey = isGeminiKeyValid(targetConfig.ai?.geminiApiKey);

  // Check if stable provider is gemini and requires key
  const stableRequiresGemini = (aiRoutingMode === 'STABLE_ONLY' || aiRoutingMode === 'SHADOW' || (aiRoutingMode === 'CANARY' && canaryPct < 100)) && stableProvider === 'gemini';
  if (stableRequiresGemini && !geminiHasKey) {
    throw new Error('Startup Error: AI_PROVIDER is set to gemini (stable), but GEMINI_API_KEY is missing or placeholder.');
  }

  // Check if candidate provider in CANDIDATE_ONLY mode requires key
  const candidateOnlyRequiresGemini = aiRoutingMode === 'CANDIDATE_ONLY' && candidateProvider === 'gemini';
  if (candidateOnlyRequiresGemini && !geminiHasKey) {
    throw new Error('Startup Error: AI_PROVIDER is set to gemini (CANDIDATE_ONLY), but GEMINI_API_KEY is missing or placeholder.');
  }


  // If candidate provider is gemini in SHADOW or CANARY mode, log safe fallback warning
  if (candidateProvider === 'gemini' && !geminiHasKey) {
    if (aiRoutingMode === 'SHADOW') {
      console.warn('[Startup Config] Warning: AI routing mode is SHADOW with gemini candidate, but GEMINI_API_KEY is missing or placeholder. Shadow execution will safely skip.');
    } else if (aiRoutingMode === 'CANARY' && canaryPct > 0) {
      console.warn('[Startup Config] Warning: AI routing mode is CANARY with gemini candidate, but GEMINI_API_KEY is missing or placeholder. Canary users will safely fallback to stable provider.');
    }
  }

  if (stableRequiresGemini || candidateOnlyRequiresGemini) {
    aiValid = geminiHasKey;
  } else {
    console.log(`[Startup Config] AI Routing: ${aiRoutingMode} (Stable: ${stableProvider}, Candidate: ${candidateProvider})`);
  }

  return { whatsappValid, mediaValid, aiValid };
}
