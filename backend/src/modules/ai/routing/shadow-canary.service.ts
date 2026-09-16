import { createHash, randomUUID } from 'crypto';
import { config, resolveAIRoutingConfig } from '../../../config/env.js';
import { AIProcessResult } from '../ai.types.js';
import { geminiService } from '../gemini.service.js';
import { aiTelemetryService } from '../telemetry/ai-telemetry.service.js';
import { loadConversationState, AIConversationState } from '../state/ai-state.types.js';

export type RoutingMode = 'STABLE_ONLY' | 'SHADOW' | 'CANARY' | 'CANDIDATE_ONLY';

export interface RoutingConfig {
  stableProvider: 'smart_nlu' | 'gemini';
  candidateProvider: 'smart_nlu' | 'gemini';
  routingMode: RoutingMode;
  canaryPercentage: number; // 0 to 100
  candidateModelEndpoint?: string;
  stableModelEndpoint?: string;
}

export interface ProviderProcessOptions {
  shadowMode?: boolean;
  canary?: boolean;
  requestId?: string;
  conversationId?: number;
  modelEndpoint?: string;
  stateSnapshot?: AIConversationState;
}

import { query, execute } from '../../../database/db.js';

export class ShadowCanaryRouter {
  private config: RoutingConfig = {
    ...resolveAIRoutingConfig(config.ai),
  };

  /**
   * Reconcile configuration from MySQL durable table (Finding K).
   * Ensures shadow/canary deployments survive instance restarts.
   */
  async reconcileFromDatabase(): Promise<void> {
    try {
      const rows = await query<any[]>(
        `SELECT routing_mode, stable_provider, candidate_provider, canary_percentage,
                stable_model_endpoint, candidate_model_endpoint, last_rollback_reason
         FROM ai_routing_config WHERE id = 1 LIMIT 1`
      );
      if (rows && rows.length > 0) {
        const r = rows[0];
        if (config.nodeEnv === 'production' && (r.stable_provider !== 'gemini' || r.candidate_provider !== 'gemini')) {
          throw new Error('Startup Error: persisted production AI routing is not Gemini-only. Refusing to load unsafe routing configuration.');
        }
        this.config = {
          ...this.config,
          routingMode: (r.routing_mode as RoutingMode) || this.config.routingMode,
          stableProvider: (r.stable_provider as any) || this.config.stableProvider,
          candidateProvider: (r.candidate_provider as any) || this.config.candidateProvider,
          canaryPercentage: Number(r.canary_percentage ?? this.config.canaryPercentage),
          stableModelEndpoint: r.stable_model_endpoint || this.config.stableModelEndpoint,
          candidateModelEndpoint: r.candidate_model_endpoint || this.config.candidateModelEndpoint,
        };
        console.log(`[AI Router] Reconciled durable config from MySQL: mode=${this.config.routingMode}, canary=${this.config.canaryPercentage}%`);
      }
    } catch {
      // If DB not ready yet, keep in-memory config
    }
  }

  async configure(newConfig: Partial<RoutingConfig>): Promise<void> {
    if (config.nodeEnv === 'production' && (newConfig.stableProvider === 'smart_nlu' || newConfig.candidateProvider === 'smart_nlu')) {
      throw new Error('Production AI routing is Gemini-only; Smart NLU cannot be configured.');
    }
    this.config = { ...this.config, ...newConfig };
    console.log(
      `[AI Router] Configured mode: ${this.config.routingMode} (Canary: ${this.config.canaryPercentage}%, Stable: ${this.config.stableProvider}, Candidate: ${this.config.candidateProvider})`
    );

    // Persist to MySQL ai_routing_config (Finding K)
    try {
      await execute(
        `INSERT INTO ai_routing_config (
          id, routing_mode, stable_provider, candidate_provider, canary_percentage,
          stable_model_endpoint, candidate_model_endpoint, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          routing_mode = VALUES(routing_mode),
          stable_provider = VALUES(stable_provider),
          candidate_provider = VALUES(candidate_provider),
          canary_percentage = VALUES(canary_percentage),
          stable_model_endpoint = VALUES(stable_model_endpoint),
          candidate_model_endpoint = VALUES(candidate_model_endpoint),
          updated_at = NOW()`,
        [
          this.config.routingMode,
          this.config.stableProvider,
          this.config.candidateProvider,
          this.config.canaryPercentage,
          this.config.stableModelEndpoint || null,
          this.config.candidateModelEndpoint || null,
        ]
      );
    } catch (err: any) {
      console.warn('[AI Router] Failed to persist routing config to DB:', err?.message || err);
    }
  }

  getConfig(): Readonly<RoutingConfig> {
    return { ...this.config };
  }

  async setRouting(options: {
    mode: 'STABLE_ONLY' | 'SHADOW' | 'CANARY' | 'CANDIDATE_ONLY' | 'LIVE';
    canaryPercentage?: number;
    candidateModelEndpoint?: string;
    stableModelEndpoint?: string;
    updatedBy?: string;
  }): Promise<void> {
    const routingMode = options.mode === 'LIVE' ? 'STABLE_ONLY' : options.mode;
    await this.configure({
      routingMode: routingMode as RoutingMode,
      canaryPercentage: options.canaryPercentage ?? (routingMode === 'STABLE_ONLY' ? 0 : this.config.canaryPercentage),
      candidateModelEndpoint: options.candidateModelEndpoint,
      stableModelEndpoint: options.stableModelEndpoint,
    });
  }

  getStatus(): {
    mode: RoutingMode | string;
    routingMode: RoutingMode;
    canaryPercentage: number;
    stableProvider: string;
    candidateProvider: string;
    candidateModelEndpoint?: string;
    stableModelEndpoint?: string;
  } {
    return {
      mode: this.config.routingMode,
      routingMode: this.config.routingMode,
      canaryPercentage: this.config.canaryPercentage,
      stableProvider: this.config.stableProvider,
      candidateProvider: this.config.candidateProvider,
      candidateModelEndpoint: this.config.candidateModelEndpoint,
      stableModelEndpoint: this.config.stableModelEndpoint,
    };
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

  async rollbackToStable(reason: string = 'Automated safety rollback trigger'): Promise<void> {
    this.config.routingMode = 'STABLE_ONLY';
    this.config.canaryPercentage = 0;
    console.warn(`[AI Router] ROLLBACK TRIGGERED: Switched to STABLE_ONLY mode. Reason: ${reason}`);

    try {
      await execute(
        `UPDATE ai_routing_config
         SET routing_mode = 'STABLE_ONLY',
             canary_percentage = 0,
             last_rollback_reason = ?,
             updated_at = NOW()
         WHERE id = 1`,
        [reason]
      );
    } catch {}
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
    stableProcessor?: (p: string, m: string, media?: any, options?: ProviderProcessOptions) => Promise<AIProcessResult>,
    options?: ProviderProcessOptions
  ): Promise<{
    result: AIProcessResult;
    executionMode: 'LIVE' | 'CANARY';
    shadowRan: boolean;
    requestId?: string;
    provider: 'smart_nlu' | 'gemini';
  }> {
    const effectiveRoutingMode = this.config.routingMode;
    const { candidateProvider, stableProvider } = this.config;
    if (config.nodeEnv === 'production' && (stableProvider !== 'gemini' || candidateProvider !== 'gemini')) {
      throw new Error('Production AI routing is Gemini-only; refusing a non-Gemini customer turn.');
    }
    const requestId = options?.requestId || `req-${randomUUID()}`;
    const providerOptions: ProviderProcessOptions = {
      ...options,
      requestId,
      conversationId: options?.conversationId,
    };
    let preTurnState: AIConversationState | undefined;
    if (effectiveRoutingMode === 'SHADOW' && options?.conversationId && candidateProvider === 'gemini') {
      try {
        const rows = await query<any[]>(`SELECT customer_id FROM conversations WHERE id = ? LIMIT 1`, [options.conversationId]);
        if (rows.length > 0) preTurnState = await loadConversationState(Number(rows[0].customer_id), options.conversationId);
      } catch (err: any) {
        console.warn('[AI Router] Could not capture pre-turn shadow snapshot:', err?.message || err);
      }
    }

    // 1. CANARY MODE
    if (effectiveRoutingMode === 'CANARY' && this.isCanaryEligible(phone)) {
      // If candidate provider is Gemini but lacks credentials, fail safely by falling back to stable
      if (candidateProvider === 'gemini' && !this.hasCredentials('gemini')) {
        console.warn('[AI Router] Canary candidate (gemini) lacks valid credentials. Failing safe to stable provider.');
        const fallbackResult =
          stableProvider === 'gemini'
            ? await geminiService.processCustomerMessage(phone, messageText, mediaType, providerOptions)
            : stableProcessor
            ? await stableProcessor(phone, messageText, mediaType, providerOptions)
            : await geminiService.processCustomerMessage(phone, messageText, mediaType, providerOptions);
        return { result: fallbackResult, executionMode: 'LIVE', shadowRan: false, requestId, provider: stableProvider };
      }

      const result =
        candidateProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType, {
              ...providerOptions,
              canary: true,
              modelEndpoint: this.config.candidateModelEndpoint,
            })
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType, providerOptions)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType, providerOptions);

      return { result, executionMode: 'CANARY', shadowRan: false, requestId, provider: candidateProvider };
    }

    // 2. CANDIDATE ONLY MODE (Fails closed if candidate lacks credentials - G-062)
    if (effectiveRoutingMode === 'CANDIDATE_ONLY') {
      const result =
        candidateProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType, {
              ...providerOptions,
              modelEndpoint: this.config.candidateModelEndpoint,
            })
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType, providerOptions)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType, providerOptions);

      return { result, executionMode: 'LIVE', shadowRan: false, requestId, provider: candidateProvider };
    }


    // 3. STABLE ONLY MODE
    if (effectiveRoutingMode === 'STABLE_ONLY' || !stableProcessor) {
      const result =
        stableProvider === 'gemini'
          ? await geminiService.processCustomerMessage(phone, messageText, mediaType, {
              ...providerOptions,
              modelEndpoint: this.config.stableModelEndpoint,
            })
          : stableProcessor
          ? await stableProcessor(phone, messageText, mediaType, providerOptions)
          : await geminiService.processCustomerMessage(phone, messageText, mediaType, providerOptions);

      return { result, executionMode: 'LIVE', shadowRan: false, requestId, provider: stableProvider };
    }

    // 4. SHADOW MODE
    // Step A: Run stable provider to serve the live customer immediately
    const liveResult =
      stableProvider === 'gemini'
        ? await geminiService.processCustomerMessage(phone, messageText, mediaType, {
            ...providerOptions,
            modelEndpoint: this.config.stableModelEndpoint,
          })
        : await stableProcessor(phone, messageText, mediaType, providerOptions);

    // Step B: Run candidate in mutation-disabled shadow mode asynchronously
    let shadowRan = false;
    if (candidateProvider === 'gemini' && !this.hasCredentials('gemini')) {
      console.warn('[AI Router] Skipping shadow run: candidate (gemini) lacks credentials.');
    } else {
      try {
        shadowRan = true;
        this.executeShadow(phone, messageText, mediaType, liveResult, requestId, options?.conversationId, preTurnState).catch((err) => {
          console.warn('[AI Router] Shadow execution error:', err?.message || err);
        });
      } catch (err) {
        console.warn('[AI Router] Could not launch shadow run:', err);
      }
    }

    return { result: liveResult, executionMode: 'LIVE', shadowRan, requestId, provider: stableProvider };
  }

  /**
   * Mutation-disabled shadow execution.
   * Runs the actual candidate planner with shadowMode: true to prevent any DB or Redis mutations,
   * suppresses outbound WhatsApp messaging, and records comparison telemetry.
   */
  async executeShadow(
    phone: string,
    messageText: string,
    mediaType: any,
    liveResult: AIProcessResult,
    requestId: string,
    conversationId?: number,
    stateSnapshot?: AIConversationState
  ): Promise<AIProcessResult | null> {
    const startTime = Date.now();
    try {
      let candidateResult: AIProcessResult | null = null;
      if (this.config.candidateProvider === 'gemini') {
        candidateResult = await geminiService.processCustomerMessage(phone, messageText, mediaType, {
          shadowMode: true,
          requestId,
          conversationId,
          stateSnapshot,
          modelEndpoint: this.config.candidateModelEndpoint,
        });
      }

      if (candidateResult) {
        await aiTelemetryService.recordInteraction({
          aiContext: 'CUSTOMER_WHATSAPP',
          provider: 'shadow-router',
          model: this.config.candidateModelEndpoint || ('shadow-' + this.config.candidateProvider),
          interactionType: 'CHAT_TURN',
          rawInput: messageText,
          rawOutput: candidateResult.replyText || '',
          detectedIntent: candidateResult.intent,
          latencyMs: Date.now() - startTime,
          success: true,
          executionMode: 'SHADOW',
          requestId,
          conversationId,
        });

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
            conversationId,
          });
        }
      }
      return candidateResult;
    } catch (err: any) {
      console.warn('[AI Router] Shadow candidate execution failed:', err?.message || err);
      await aiTelemetryService.recordInteraction({
        aiContext: 'CUSTOMER_WHATSAPP',
        provider: 'shadow-router',
        model: 'shadow-' + this.config.candidateProvider,
        interactionType: 'ERROR',
        rawInput: messageText,
        rawOutput: '',
        detectedIntent: liveResult.intent,
        latencyMs: Date.now() - startTime,
        success: false,
        errorCode: 'SHADOW_CANDIDATE_FAILED',
        errorMessage: String(err?.message || err),
        executionMode: 'SHADOW',
        requestId,
        conversationId,
      });
      return null;
    }
  }
}

export const shadowCanaryRouter = new ShadowCanaryRouter();
