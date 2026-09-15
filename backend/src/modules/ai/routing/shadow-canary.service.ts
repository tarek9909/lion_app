import { createHash, randomUUID } from 'crypto';
import { config } from '../../../config/env.js';
import { AIProcessResult } from '../ai.types.js';
import { geminiService } from '../gemini.service.js';
import { aiTelemetryService } from '../telemetry/ai-telemetry.service.js';

export type RoutingMode = 'STABLE_ONLY' | 'SHADOW' | 'CANARY' | 'CANDIDATE_ONLY';

export interface RoutingConfig {
  stableProvider: 'smart_nlu' | 'gemini';
  candidateProvider: 'smart_nlu' | 'gemini';
  routingMode: RoutingMode;
  canaryPercentage: number; // 0 to 100
}

export class ShadowCanaryRouter {
  private config: RoutingConfig = {
    stableProvider: config.ai.stableProvider || (config.ai.provider === 'gemini' ? 'gemini' : 'smart_nlu'),
    candidateProvider: config.ai.candidateProvider || 'gemini',
    routingMode: config.ai.routingMode || (config.ai.provider === 'gemini' ? 'CANDIDATE_ONLY' : 'STABLE_ONLY'),
    canaryPercentage: config.ai.canaryPercentage || 0,
  };

  configure(newConfig: Partial<RoutingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(
      `[AI Router] Configured mode: ${this.config.routingMode} (Canary: ${this.config.canaryPercentage}%, Stable: ${this.config.stableProvider}, Candidate: ${this.config.candidateProvider})`
    );
  }

  getConfig(): Readonly<RoutingConfig> {
    return { ...this.config };
  }

  hasCredentials(provider: 'smart_nlu' | 'gemini'): boolean {
    if (provider === 'smart_nlu') return true;
    if (provider === 'gemini') {
      const key = config.ai.geminiApiKey;
      return (
        Boolean(key) &&
        !key.startsWith('demo_') &&
        key !== 'placeholder' &&
        key !== 'your_gemini_api_key_here' &&
        key !== 'demo_gemini_api_key_placeholder'
      );
    }
    return false;
  }

  rollbackToStable(): void {
    this.config.routingMode = 'STABLE_ONLY';
    this.config.canaryPercentage = 0;
    console.warn('[AI Router] ROLLBACK TRIGGERED: Switched to STABLE_ONLY mode.');
  }

  /**
   * Determine if a customer falls into the canary bucket (0 to 100)
   */
  isCanaryEligible(phone: string): boolean {
    if (this.config.canaryPercentage <= 0) return false;
    if (this.config.canaryPercentage >= 100) return true;

    const hash = createHash('md5').update(phone).digest('hex');
    const bucket = parseInt(hash.slice(0, 4), 16) % 100;
    return bucket < this.config.canaryPercentage;
  }

  /**
   * Execute with shadow and canary support.
   * In SHADOW mode:
   * - The stable provider executes real mutations and sends the customer reply.
   * - The candidate provider runs in a mutation-disabled sandbox and logs telemetry with execution_mode='SHADOW'.
   * - Zero duplicate cart mutations and zero duplicate customer messages.
   */
  async routeCustomerMessage(
    phone: string,
    messageText: string,
    mediaType?: 'text' | 'image' | 'audio' | 'location',
    stableProcessor?: (p: string, m: string, media?: any) => Promise<AIProcessResult>,
    options?: { requestId?: string }
  ): Promise<{ result: AIProcessResult; executionMode: 'LIVE' | 'CANARY'; shadowRan: boolean; requestId?: string }> {
    const effectiveRoutingMode =
      config.ai.provider === 'gemini' && this.config.routingMode === 'STABLE_ONLY'
        ? 'CANDIDATE_ONLY'
        : this.config.routingMode;
    const { candidateProvider, stableProvider } = this.config;

    // 1. CANARY MODE
    if (effectiveRoutingMode === 'CANARY' && this.isCanaryEligible(phone)) {
      // If candidate provider is Gemini but lacks credentials, fail safely by falling back to stable
      if (candidateProvider === 'gemini' && !this.hasCredentials('gemini')) {
        console.warn('[AI Router] Canary candidate (gemini) lacks valid credentials. Failing safe to stable provider.');
        const fallbackResult =
          stableProvider === 'gemini'
            ? await geminiService.processCustomerMessage(phone, messageText, mediaType)
            : stableProcessor
            ? await stableProcessor(phone, messageText, mediaType)
            : await geminiService.processCustomerMessage(phone, messageText, mediaType);
        return { result: fallbackResult, executionMode: 'LIVE', shadowRan: false };
      }

      const result =
        candidateProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType, { canary: true })
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType);

      return { result, executionMode: 'CANARY', shadowRan: false };
    }

    // 2. CANDIDATE ONLY MODE (Fails closed if candidate lacks credentials - G-062)
    if (effectiveRoutingMode === 'CANDIDATE_ONLY') {
      const result =
        candidateProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType)
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType);

      return { result, executionMode: 'LIVE', shadowRan: false };
    }


    // 3. STABLE ONLY MODE
    if (effectiveRoutingMode === 'STABLE_ONLY' || !stableProcessor) {
      const result =
        stableProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType)
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType);

      return { result, executionMode: 'LIVE', shadowRan: false };
    }

    // 4. SHADOW MODE
    // Step A: Run stable provider to serve the live customer immediately
    const liveResult =
      stableProvider === 'gemini'
        ? await geminiService.processCustomerMessage(phone, messageText, mediaType)
        : await stableProcessor(phone, messageText, mediaType);

    // Step B: Run candidate in mutation-disabled shadow mode asynchronously
    let shadowRan = false;
    const requestId = options?.requestId || `req-shadow-${randomUUID()}`;
    if (candidateProvider === 'gemini' && !this.hasCredentials('gemini')) {
      console.warn('[AI Router] Skipping shadow run: candidate (gemini) lacks credentials.');
    } else {
      try {
        shadowRan = true;
        this.executeShadowAsync(phone, messageText, mediaType, liveResult, requestId).catch((err) => {
          console.warn('[AI Router] Shadow execution error:', err?.message || err);
        });
      } catch (err) {
        console.warn('[AI Router] Could not launch shadow run:', err);
      }
    }

    return { result: liveResult, executionMode: 'LIVE', shadowRan, requestId };
  }

  /**
   * Asynchronous mutation-disabled shadow execution.
   * Runs the actual candidate planner with shadowMode: true to prevent any DB or Redis mutations,
   * suppresses outbound WhatsApp messaging, and records comparison telemetry.
   */
  private async executeShadowAsync(
    phone: string,
    messageText: string,
    mediaType: any,
    liveResult: AIProcessResult,
    requestId: string
  ): Promise<void> {
    const startTime = Date.now();
    try {
      let candidateResult: AIProcessResult | null = null;
      if (this.config.candidateProvider === 'gemini') {
        candidateResult = await geminiService.processCustomerMessage(phone, messageText, mediaType, {
          shadowMode: true,
          requestId,
        });
      }

      if (candidateResult) {
        const intentDisagreement = liveResult.intent !== candidateResult.intent;
        const actionDisagreement = liveResult.actionTaken !== candidateResult.actionTaken;

        if (intentDisagreement || actionDisagreement) {
          console.info(
            `[AI Router: SHADOW DISAGREEMENT] Phone: ${phone.slice(-4)} | ` +
              `Stable: ${liveResult.intent} (${liveResult.actionTaken || 'none'}) vs ` +
              `Candidate: ${candidateResult.intent} (${candidateResult.actionTaken || 'none'})`
          );

          // Persist stable-versus-candidate disagreement telemetry (Audit Finding Area B)
          await aiTelemetryService.recordInteraction({
            aiContext: 'CUSTOMER_WHATSAPP',
            provider: 'shadow-router',
            model: 'disagreement-detector',
            interactionType: 'SHADOW_DISAGREEMENT' as any,
            rawInput: messageText,
            rawOutput: `Stable: ${liveResult.intent} (${liveResult.actionTaken || 'none'}) vs Candidate: ${candidateResult.intent} (${candidateResult.actionTaken || 'none'})`,
            detectedIntent: liveResult.intent,
            latencyMs: Date.now() - startTime,
            success: true,
            executionMode: 'SHADOW',
            requestId,
          });
        }
      }
    } catch (err: any) {
      console.warn('[AI Router] Shadow candidate execution failed:', err?.message || err);
    }
  }
}

export const shadowCanaryRouter = new ShadowCanaryRouter();
