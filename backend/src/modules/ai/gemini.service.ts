import { config } from '../../config/env.js';
import { catalogService, SearchResult } from '../catalog/catalog.service.js';
import { cartService } from '../carts/cart.service.js';
import { customerService } from '../customers/customer.service.js';
import { orderService } from '../orders/order.service.js';
import { redis } from '../../database/redis.js';
import { AIProcessResult, ValidatedIntent } from './ai.types.js';
import { getAuthoritativeGeminiToolDeclarations } from './contract/tool-schemas.js';
import { getGeminiSystemPrompt, PROMPT_VERSION } from './prompts/gemini.system-prompt.js';
import {
  BEHAVIOR_CONTRACT_VERSION,
  TOOL_INTENT_MAP,
  toLegacyIntent,
  ControlledTool,
  isMutatingTool,
  CanonicalIntent,
} from './contract/behavior.contract.js';
import { aiToolsExecutor, ToolExecutionResult } from './tools/ai-tools.executor.js';
import {
  AIConversationState,
  loadConversationState,
  saveConversationState,
  createInitialState,
  sanitizeStateSnapshot,
} from './state/ai-state.types.js';
import { aiTelemetryService } from './telemetry/ai-telemetry.service.js';
import { calculateGeminiCost } from './telemetry/gemini-pricing.js';
import { randomUUID } from 'node:crypto';
import { INTERACTIVE_NOT_FOUND_REPLY, isNotFoundError, resultHasNoCatalogMatches } from './interactive-not-found.js';

export function detectLanguage(text: string): string {
  const clean = (text || '').trim();
  const hasArabicScript = /[\u0600-\u06FF]/.test(clean);
  const hasLatin = /[a-zA-Z]/.test(clean);
  const hasArabiziMarkers =
    /\b(?:shou|chou|kifak|wein|wen|bade|baddi|akid|akeed|tamam|habibi|ya3tik|ma2liyeh|3al|el|baddel|badel)\b|[23578]/.test(
      clean.toLowerCase()
    );

  if (hasArabicScript && hasLatin) return 'mixed';
  if (hasArabicScript) return 'ar';
  if (hasArabiziMarkers) return 'arabizi';
  if (hasLatin) return 'en';
  return 'arabizi';
}

export interface GeminiMessagePart {
  text?: string;
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, any>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, any>;
  };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiMessagePart[];
}

export class GeminiService {
  private fetchFn: typeof fetch = fetch;
  private maxToolRounds = 5;
  private readonly maxCustomerMessageLength = 4096;
  private readonly maxWhatsAppReplyLength = 4096;

  /**
   * Injectable fetch for testing without live external API keys
   */
  setFetchFn(fn: typeof fetch) {
    this.fetchFn = fn;
  }

  resetFetchFn() {
    this.fetchFn = fetch;
  }

  private async recordFailureTelemetry(input: {
    conversationId: number | null;
    requestId: string;
    rawInput: string;
    stateBefore: any;
    stateAfter: any;
    model: string;
    startedAt: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    try {
      await aiTelemetryService.recordInteraction({
        conversationId: input.conversationId,
        aiContext: 'CUSTOMER_WHATSAPP',
        provider: 'gemini',
        model: input.model,
        interactionType: 'CHAT_TURN',
        rawInput: input.rawInput,
        rawOutput: '',
        detectedIntent: 'GREETING',
        detectedLanguage: detectLanguage(input.rawInput),
        toolCalls: [],
        stateBefore: input.stateBefore,
        stateAfter: input.stateAfter,
        promptVersion: PROMPT_VERSION,
        toolSchemaVersion: '2.0.0',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - input.startedAt,
        estimatedCostUsd: 0,
        success: false,
        executionMode: 'LIVE',
        requestId: input.requestId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      });
    } catch (telemetryErr) {
      console.warn('[Gemini Service] Error recording failure telemetry:', telemetryErr);
    }
  }

  private clampString(value: unknown, maxLength: number): string {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  private truncateReply(text: string): string {
    const normalized = String(text || '').replace(/\u0000/g, '').trim();
    if (normalized.length <= this.maxWhatsAppReplyLength) return normalized;
    return `${normalized.slice(0, this.maxWhatsAppReplyLength - 24).trim()}\n\n[Reply shortened]`;
  }

  private async getHistory(customerId: number): Promise<{ role: 'user' | 'model'; text: string }[]> {
    try {
      const raw = await redis.get(`ai:history:${customerId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  private async appendHistory(customerId: number, userText: string, modelText: string): Promise<void> {
    try {
      const history = await this.getHistory(customerId);
      history.push({ role: 'user', text: userText });
      history.push({ role: 'model', text: modelText });
      const trimmed = history.slice(-10);
      await redis.set(`ai:history:${customerId}`, JSON.stringify(trimmed), 86400);
    } catch (err) {
      console.warn('[Gemini Service] Error updating history in Redis:', err);
    }
  }

  private async executeTool(
    toolName: string,
    args: Record<string, any>,
    customerId: number,
    state: AIConversationState,
    mutationCountThisTurn: number,
    options?: { shadowMode?: boolean },
    userMessage?: string
  ): Promise<ToolExecutionResult> {
    return aiToolsExecutor.executeTool(
      toolName,
      args,
      customerId,
      state,
      mutationCountThisTurn,
      options,
      userMessage
    );
  }

  /**
   * Primary entry point for customer WhatsApp messaging handled by Gemini.
   */
  async processCustomerMessage(
    whatsappNumber: string,
    messageText: string,
    mediaType?: 'text' | 'image' | 'audio' | 'location',
    options?: { shadowMode?: boolean; canary?: boolean; requestId?: string; conversationId?: number }
  ): Promise<AIProcessResult & { shadowExecution?: boolean }> {
    const apiKey = config.ai.geminiApiKey;
    const model = config.ai.geminiModel || 'gemini-2.5-flash';

    if (
      this.fetchFn === fetch && (
        !apiKey ||
        apiKey.startsWith('demo_') ||
        apiKey === 'placeholder' ||
        apiKey === 'demo_gemini_api_key_placeholder'
      )
    ) {
      throw new Error(
        'Gemini Service Error: AI_PROVIDER is set to gemini but GEMINI_API_KEY is not configured or placeholder.'
      );
    }

    // Shadow mode: Zero customer creation (Audit Finding Area B)
    let customer: any;
    if (options?.shadowMode) {
      customer = await customerService.findByPhone(whatsappNumber);
      if (!customer) {
        customer = {
          id: -1,
          public_id: 'shadow-customer-temp',
          whatsapp_number: whatsappNumber,
          display_name: 'Shadow Customer',
          preferred_language: 'en',
          status: 'ACTIVE',
        };
      }
    } else {
      customer = await customerService.findOrCreateByPhone(whatsappNumber);
    }

    // The inbound controller/processor owns the persisted conversation ID.
    // Do not guess a conversation by querying the latest open row.
    const conversationId: number | null = options?.conversationId || null;
    const requestId = options?.requestId || randomUUID();

    const state = customer.id > 0 ? await loadConversationState(customer.id) : createInitialState(-1);
    const stateBeforeSnapshot = sanitizeStateSnapshot(state);
    const startTime = Date.now();
    const text = this.clampString(messageText, this.maxCustomerMessageLength);

    if (!text) {
      const reply =
        'I received your message, but it was empty. Please send what you would like to order, a voice note, a clear product photo, or a location pin.';
      if (!options?.shadowMode && customer.id > 0) {
        await this.appendHistory(customer.id, text, reply);
      }
      return {
        replyText: reply,
        intent: 'GENERAL_GREETING',
        confidence: 0.99,
      };
    }

    // 1. Resolve pending clarification if customer answered it directly
    if (state.stage === 'AWAITING_CLARIFICATION' && state.pendingClarification) {
      const lower = text.toLowerCase().trim();
      if (state.pendingClarification.type === 'VARIANT_OPTION') {
        let matchedTarget: string | null = null;
        if (
          lower.includes('coke') ||
          lower.includes('drink') ||
          lower === 'كولا' ||
          lower === 'المشروب'
        ) {
          matchedTarget = 'coke';
        } else if (
          lower.includes('meal') ||
          lower.includes('chicken') ||
          lower === 'الوجبة' ||
          lower === 'دجاج'
        ) {
          matchedTarget = 'meal';
        }

        if (matchedTarget) {
          if (!options?.shadowMode && customer.id > 0) {
            const cart = await cartService.getOrCreateActiveCart(customer.id);
            const requestedVariant =
              state.pendingClarification.requestedValue ||
              (state.pendingClarification as any).originalValue ||
              'Large';
            const updateRes = await cartService.updateItemVariant(cart.id, matchedTarget, requestedVariant);
            state.pendingClarification = null;
            state.stage = 'EDITING_CART';
            const refreshedCart = await cartService.getOrCreateActiveCart(customer.id);
            const totals = await cartService.recalculateCart(cart.id);
            const targetName = matchedTarget === 'coke' ? 'Coke Zero' : 'Crispy Chicken Meal';
            const reply = `Got it! Updated the ${targetName} to **${requestedVariant}**${updateRes.newPrice ? ` ($${updateRes.newPrice.toFixed(2)})` : ''}.\n\nYour cart total is **$${totals.total.toFixed(2)}**. Where should we deliver this? (e.g. *Home* / *3al Bet*)`;

            await saveConversationState(customer.id, state);
            await this.appendHistory(customer.id, text, reply);

            return {
              intent: 'CLARIFICATION_RESOLVED',
              confidence: 0.98,
              actionTaken: 'UPDATED_VARIANT',
              replyText: reply,
              cartSummary: refreshedCart,
              shadowExecution: false,
            };
          } else {
            // Shadow mode: Pure in-memory simulation, ZERO db cart mutation
            state.pendingClarification = null;
            state.stage = 'EDITING_CART';
            const targetName = matchedTarget === 'coke' ? 'Coke Zero' : 'Crispy Chicken Meal';
            const reply = `[Shadow Simulation] Clarification resolved: Updated ${targetName}`;
            return {
              intent: 'CLARIFICATION_RESOLVED',
              confidence: 0.98,
              actionTaken: 'UPDATED_VARIANT',
              replyText: reply,
              shadowExecution: true,
            };
          }
        }
      }
    }

    // Build conversation context from Redis history
    const history = await this.getHistory(customer.id);
    const contents: GeminiContent[] = [];

    // Append previous dialogue turns
    for (const h of history.slice(-6)) {
      contents.push({
        role: h.role,
        parts: [{ text: h.text }],
      });
    }

    // Append current customer inbound message with context cues
    let userPromptText = text;
    if (mediaType === 'audio') {
      userPromptText = `[Voice Note Transcription]: ${text}`;
    } else if (mediaType === 'image') {
      userPromptText = `[Customer sent product photo]: ${text || 'Do they have this?'}`;
    } else if (mediaType === 'location') {
      userPromptText = `[Customer shared location pin]: ${text}`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: userPromptText }],
    });

    const tools = getAuthoritativeGeminiToolDeclarations();
    const systemInstruction = getGeminiSystemPrompt(sanitizeStateSnapshot(state));

    let primaryIntent: CanonicalIntent = 'GREETING';
    let actionTaken: string | undefined;
    let orderCreated: any;
    let finalText = '';
    let mutationsExecutedCount = 0;
    const recordedToolCalls: any[] = [];
    const recordedToolResults: any[] = [];
    let interactiveNotFound = false;
    let promptTokensTotal = 0;
    let candidatesTokensTotal = 0;

    // Autonomous Tool Calling Loop (bounded by maxToolRounds)
    let rounds = 0;
    while (rounds < this.maxToolRounds) {
      rounds++;

      const payload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        tools,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000,
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(config.ai.geminiRequestTimeoutMs),
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        console.error('[Gemini API Network Error]:', err.message);
        await this.recordFailureTelemetry({
          conversationId,
          requestId,
          rawInput: text,
          stateBefore: stateBeforeSnapshot,
          stateAfter: sanitizeStateSnapshot(state),
          model,
          startedAt: startTime,
          errorCode: 'GEMINI_NETWORK_ERROR',
          errorMessage: err.message,
        });
        throw new Error(
          `Gemini API connection error: ${err.name === 'TimeoutError' ? 'request timed out' : err.message}`
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gemini API Error HTTP ${response.status}]:`, errText);
        await this.recordFailureTelemetry({
          conversationId,
          requestId,
          rawInput: text,
          stateBefore: stateBeforeSnapshot,
          stateAfter: sanitizeStateSnapshot(state),
          model,
          startedAt: startTime,
          errorCode: `GEMINI_HTTP_${response.status}`,
          errorMessage: errText.slice(0, 1000),
        });
        throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
      }

      const responseData: any = await response.json();
      if (responseData.usageMetadata) {
        promptTokensTotal += responseData.usageMetadata.promptTokenCount || 0;
        candidatesTokensTotal += responseData.usageMetadata.candidatesTokenCount || 0;
      }

      const candidate = responseData.candidates?.[0];
      if (!candidate || !candidate.content) {
        await this.recordFailureTelemetry({
          conversationId,
          requestId,
          rawInput: text,
          stateBefore: stateBeforeSnapshot,
          stateAfter: sanitizeStateSnapshot(state),
          model,
          startedAt: startTime,
          errorCode: 'GEMINI_EMPTY_RESPONSE',
          errorMessage: 'Gemini API returned an empty response candidate.',
        });
        throw new Error('Gemini API returned an empty response candidate.');
      }

      const modelParts: GeminiMessagePart[] = candidate.content.parts || [];
      const functionCallParts = modelParts.filter((part) => part.functionCall?.name);

      if (functionCallParts.length > 0) {
        contents.push({ role: 'model', parts: modelParts });
        const functionResponseParts: GeminiMessagePart[] = [];

        for (const part of functionCallParts) {
          const functionCall = part.functionCall!;
          const toolName = functionCall.name;
          const toolArgs = functionCall.args || {};
          recordedToolCalls.push({ name: toolName, args: toolArgs });

          let toolResult: any;
          let toolErrorCode: string | undefined;

          // Maintain ONE mutation counter across all Gemini tool rounds for the complete turn
          if (isMutatingTool(toolName) && mutationsExecutedCount >= 1) {
            toolResult = {
              success: false,
              error: 'CONFLICTING_MUTATIONS_NOT_ALLOWED',
              message:
                'Only one cart or order change can be performed per customer message. Ask the customer which change they want first.',
            };
            toolErrorCode = 'MUTATION_LIMIT_EXCEEDED';
          } else {
            const execution = await this.executeTool(
              toolName,
              toolArgs,
              customer.id,
              state,
              mutationsExecutedCount,
              options,
              text
            );
            toolResult =
              execution.result !== undefined
                ? execution.result
                : { success: execution.success, error: execution.error };
            toolErrorCode = execution.errorCode;

            if (
              isNotFoundError(execution.errorCode, execution.error) ||
              resultHasNoCatalogMatches(toolResult) ||
              (Array.isArray(toolResult) && toolResult.length > 0 && toolResult.every((entry) => entry?.isComplete === false))
            ) {
              interactiveNotFound = true;
            }

            if (execution.success && isMutatingTool(toolName)) {
              mutationsExecutedCount++;
            }

            if (execution.errorCode === 'AMBIGUOUS_CART_ITEM' || state.stage === 'AWAITING_CLARIFICATION') {
              primaryIntent = 'CLARIFICATION_REQUIRED' as any;
            } else if (toolName === 'confirm_and_create_order' && execution.success) {
              primaryIntent = 'CONFIRM_ORDER';
            } else if (toolName === 'select_delivery_address' && execution.success) {
              primaryIntent = 'SELECT_ADDRESS';
            } else if (TOOL_INTENT_MAP[toolName as ControlledTool]) {
              primaryIntent = TOOL_INTENT_MAP[toolName as ControlledTool];
            }

            if (execution.orderCreated) {
              orderCreated = execution.orderCreated;
              actionTaken = 'ORDER_CREATED';
            } else if (execution.stateChanged) {
              actionTaken = `EXECUTED_${toolName.toUpperCase()}`;
            }
          }

          recordedToolResults.push({ name: toolName, result: toolResult, errorCode: toolErrorCode });

          functionResponseParts.push({
            functionResponse: {
              ...(functionCall.id ? { id: functionCall.id } : {}),
              name: toolName,
              response:
                toolResult && typeof toolResult === 'object'
                  ? toolResult
                  : { result: toolResult },
            },
          });
        }

        contents.push({ role: 'user', parts: functionResponseParts });
        continue;
      }

      // No function call: extract final text
      const textPart = modelParts.find((p) => p.text);
      if (textPart && textPart.text) {
        finalText = this.truncateReply(textPart.text);
        break;
      }
      break;
    }

    if (interactiveNotFound) {
      finalText = INTERACTIVE_NOT_FOUND_REPLY;
    } else if (!finalText) {
      finalText =
        'I am here to help you with your order from Lion Delivery! What would you like to eat today? 🦁';
    }

    // Detect fallback intent from keywords if not resolved through tools
    const lower = text.toLowerCase();
    if (primaryIntent === 'GREETING') {
      if (
        lower.includes('where is my order') ||
        lower.includes('order status') ||
        lower.includes('wein el order')
      ) {
        primaryIntent = 'ORDER_STATUS';
      } else if (
        lower.includes('help') ||
        lower.includes('support') ||
        lower.includes('mosa3adeh')
      ) {
        primaryIntent = 'CONTACT_SUPPORT';
      }
    }

    const legacyIntent = toLegacyIntent(primaryIntent);
    const totalTokens = promptTokensTotal + candidatesTokensTotal;
    const costUsd = calculateGeminiCost(promptTokensTotal, candidatesTokensTotal);
    const detectedLang = detectLanguage(text);
    const turnSuccess = !recordedToolResults.some((r) => r.result && r.result.success === false);

    // In shadow mode, do not save state to Redis and do not record inbound/outbound history
    if (!options?.shadowMode && customer.id > 0) {
      await saveConversationState(customer.id, state);
      await this.appendHistory(customer.id, text, finalText);
    }

    // Record Telemetry
    try {
      const toolCallsCombined = recordedToolCalls.map((tc, idx) => ({
        name: tc.name,
        args: tc.args,
        result: recordedToolResults[idx]?.result,
      }));

      await aiTelemetryService.recordInteraction({
        conversationId,
        aiContext: 'CUSTOMER_WHATSAPP',
        provider: options?.canary ? 'gemini-canary' : 'gemini',
        model,
        interactionType: 'CHAT_TURN',
        rawInput: text,
        rawOutput: finalText,
        detectedIntent: primaryIntent,
        detectedLanguage: detectedLang,
        toolCalls: toolCallsCombined,
        stateBefore: stateBeforeSnapshot,
        stateAfter: sanitizeStateSnapshot(state),
        promptVersion: PROMPT_VERSION,
        toolSchemaVersion: '2.0.0',
        inputTokens: promptTokensTotal,
        outputTokens: candidatesTokensTotal,
        latencyMs: Date.now() - startTime,
        estimatedCostUsd: costUsd,
        success: turnSuccess,
        executionMode: options?.shadowMode ? 'SHADOW' : options?.canary ? 'CANARY' : 'LIVE',
        requestId,
      });
    } catch (telemetryErr) {
      console.warn('[Gemini Service] Error recording turn telemetry:', telemetryErr);
    }

    const activeCart =
      state.cartSummary ||
      (options?.shadowMode
        ? await cartService.getActiveCartReadOnly(customer.id)
        : await cartService.getOrCreateActiveCart(customer.id));

    return {
      replyText: finalText,
      intent: legacyIntent as ValidatedIntent,
      confidence: 0.95,
      actionTaken,
      cartSummary: activeCart,
      orderCreated,
      shadowExecution: options?.shadowMode || false,
    };
  }
}

export const geminiService = new GeminiService();
