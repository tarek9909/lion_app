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
import { dispatchCustomerError, getCustomerResponseCategory, resultHasNoCatalogMatches } from './interactive-not-found.js';
import {
  detectSenderLanguage,
  getLanguageSafeFallback,
  isGenericAssistanceReply,
  isResponseInSenderLanguage,
  SenderLanguage,
} from './sender-language.js';
import { localizeReplyText } from './response-localizer.js';
import { sanitizeCustomerOutput } from './customer-output.js';
import { customerMemoryService } from './memory/customer-memory.service.js';

export function detectLanguage(text: string): string {
  return detectSenderLanguage(text);
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

  private isUnintelligibleStandalone(text: string, state: AIConversationState): boolean {
    return /^[a-z]$/iu.test(text.trim()) && !state.nextRequiredAction && !state.expectedEntity && !(state.lastPresentedOptions || []).length;
  }

  private isGreeting(text: string): boolean {
    return /^(hi|hello|hey|salam|marhaba|bonjour)$/iu.test(text.trim());
  }

  private errorFacts(result: unknown): { itemName?: string; addressLabel?: string; orderNumber?: string; verifiedOptions?: string[] } {
    const value = result && typeof result === 'object' ? result as Record<string, any> : {};
    const alternatives = Array.isArray(value.verified_alternatives)
      ? value.verified_alternatives.map((entry: any) => String(entry?.product_name || entry?.name || '')).filter(Boolean)
      : [];
    return {
      itemName: value.requested_name || value.product_name || value.item_name || undefined,
      addressLabel: value.address_label || undefined,
      orderNumber: value.order_number || undefined,
      verifiedOptions: alternatives,
    };
  }

  private checkoutSummaryText(language: SenderLanguage, summary: any): string {
    const items = Array.isArray(summary?.items) ? summary.items : [];
    const lines = items.map((item: any) => `- ${item.productName || item.product_name} x${item.quantity}: $${Number(item.totalPriceUsd ?? item.line_total ?? 0).toFixed(2)}`);
    const delivery = Number(summary?.deliveryFeeUsd ?? summary?.delivery_fee ?? 0).toFixed(2);
    const total = Number(summary?.totalUsd ?? summary?.total ?? 0).toFixed(2);
    if (language === 'arabizi') {
      return sanitizeCustomerOutput(`Molakhas l talab:\n${lines.join('\n')}\nDelivery: $${delivery}\nTotal: $${total}\nRodd confirm iza badak t2akked l talab.`);
    }
    if (language === 'fr') {
      return sanitizeCustomerOutput(`Récapitulatif de commande:\n${lines.join('\n')}\nLivraison : $${delivery}\nTotal : $${total}\nRépondez confirm pour confirmer la commande.`);
    }
    if (language === 'ar' || language === 'ar_lb' || language === 'mixed') {
      return sanitizeCustomerOutput(`ملخص الطلب:\n${lines.join('\n')}\nالتوصيل: $${delivery}\nالإجمالي: $${total}\nأرسل confirm لتأكيد الطلب.`);
    }
    return sanitizeCustomerOutput(`Order summary:\n${lines.join('\n')}\nDelivery: $${delivery}\nTotal: $${total}\nReply confirm to place the order.`);
  }

  private async getHistory(customerId: number, conversationId: number | null): Promise<{ role: 'user' | 'model'; text: string }[]> {
    try {
      const raw = await redis.get(`ai:history:${conversationId || customerId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  private async appendHistory(customerId: number, conversationId: number | null, userText: string, modelText: string): Promise<void> {
    try {
      const history = await this.getHistory(customerId, conversationId);
      history.push({ role: 'user', text: userText });
      history.push({ role: 'model', text: modelText });
      const trimmed = history.slice(-10);
      await redis.set(`ai:history:${conversationId || customerId}`, JSON.stringify(trimmed), 86400);
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
    options?: {
      shadowMode?: boolean;
      canary?: boolean;
      requestId?: string;
      conversationId?: number;
      inboundMessageId?: number;
      modelEndpoint?: string;
    }
  ): Promise<AIProcessResult & { shadowExecution?: boolean }> {
    const apiKey = config.ai.geminiApiKey;
    const model = options?.modelEndpoint || config.ai.geminiModel || 'gemini-2.5-flash';

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

    const state = customer.id > 0 ? await loadConversationState(customer.id, conversationId) : createInitialState(-1, 'arabizi', conversationId);
    state.conversationId = conversationId;
    state.turnIndex = (state.turnIndex || 0) + 1;
    const stateBeforeSnapshot = sanitizeStateSnapshot(state);
    const startTime = Date.now();
    const text = this.clampString(messageText, this.maxCustomerMessageLength);

    if (!text) {
      const reply =
        'I received your message, but it was empty. Please send what you would like to order, a voice note, a clear product photo, or a location pin.';
      if (!options?.shadowMode && customer.id > 0) {
        await saveConversationState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return {
        replyText: reply,
        intent: 'GENERAL_GREETING',
        confidence: 0.99,
      };
    }

    // Detect the language from this sender turn. A stored preference is only
    // a fallback for history; it must never override the latest message.
    const responseLanguage: SenderLanguage = detectSenderLanguage(text);
    if (customer.id > 0) {
      state.preferredLanguage = responseLanguage;
      if (!options?.shadowMode) {
        customerMemoryService.observeAndLearn(customer.id, text, requestId).catch(() => {});
      }
    }

    // A lone uninterpretable character cannot select a product or authorize a
    // mutation. Keep the task state and ask one neutral, language-matched
    // clarification without calling any tools.
    if (this.isUnintelligibleStandalone(text, state)) {
      const reply = dispatchCustomerError({ errorCode: 'UNINTELLIGIBLE_MESSAGE', language: responseLanguage })!.text;
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await saveConversationState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CLARIFICATION_REQUIRED' as ValidatedIntent, confidence: 0.99, shadowExecution: !!options?.shadowMode };
    }

    // A greeting must not discard a pending address/confirmation/product task.
    if (this.isGreeting(text) && state.nextRequiredAction && state.lastAssistantQuestion) {
      const reply = sanitizeCustomerOutput(`${responseLanguage === 'arabizi' ? 'Ahlan. ' : responseLanguage === 'fr' ? 'Bonjour. ' : 'Hello. '}${state.lastAssistantQuestion}`);
      if (!options?.shadowMode && customer.id > 0) {
        await saveConversationState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CONTINUE_PENDING_TASK' as ValidatedIntent, confidence: 0.99, shadowExecution: !!options?.shadowMode };
    }

    const isAddressStage = ['SELECTING_ADDRESS', 'ADDRESS_DRAFT_REVIEW'].includes(state.stage);
    const isAddressShaped = mediaType === 'location' || /(?:saida|sidon|abra|street|road|building|floor|near|behind|\d{3,}|شارع|صيدا|عبرا)/iu.test(text);
    if (isAddressStage && isAddressShaped) {
      const execution = await this.executeTool('capture_delivery_address', { raw_address: text }, customer.id, state, 0, options, text);
      const reply = execution.success
        ? sanitizeCustomerOutput(`${responseLanguage === 'arabizi'
          ? 'Fhemet 3enwenak. Ma fi talab 2abel l ta2kid l saree7.'
          : responseLanguage === 'fr'
            ? 'J’ai compris votre adresse. Aucune commande ne sera créée avant votre confirmation explicite.'
            : responseLanguage === 'ar' || responseLanguage === 'ar_lb' || responseLanguage === 'mixed'
              ? 'تم فهم عنوانك. لن يتم إنشاء طلب قبل تأكيدك الصريح.'
            : 'I understood your delivery address. No order will be created before your explicit confirmation.'}\n\n${this.checkoutSummaryText(responseLanguage, execution.cartSummary)}`)
        : dispatchCustomerError({ errorCode: execution.errorCode, errorMessage: execution.error, result: execution.result, language: responseLanguage, facts: this.errorFacts(execution.result) })?.text || getLanguageSafeFallback(responseLanguage);
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await saveConversationState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CAPTURE_DELIVERY_ADDRESS' as ValidatedIntent, confidence: 0.99, cartSummary: execution.cartSummary, shadowExecution: !!options?.shadowMode };
    }

    if (/(?:where is (?:my )?order|order status|wein (?:el )?order|track(?:ing)? (?:my )?order|suivi.*commande)/iu.test(text)) {
      const execution = await this.executeTool('get_order_status', {}, customer.id, state, 0, options, text);
      const result: any = execution.result || {};
      const reply = execution.success
        ? sanitizeCustomerOutput(responseLanguage === 'arabizi'
          ? `📦 Talabak #${result.order_number} men ${result.merchant_name || 'Chicken House'} hal2ad 7alto ${result.status}.`
          : responseLanguage === 'fr'
            ? `📦 Votre commande #${result.order_number} de ${result.merchant_name || 'Chicken House'} est actuellement ${result.status}.`
            : `📦 Your order #${result.order_number} from ${result.merchant_name || 'Chicken House'} is currently ${result.status}.`)
        : dispatchCustomerError({ errorCode: execution.errorCode, errorMessage: execution.error, result, language: responseLanguage, facts: this.errorFacts(result) })?.text || getLanguageSafeFallback(responseLanguage);
      if (!options?.shadowMode && customer.id > 0) {
        await saveConversationState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'ORDER_STATUS' as ValidatedIntent, confidence: 0.99, shadowExecution: !!options?.shadowMode };
    }

    // 1. Resolve pending clarification if customer answered it directly
    if (state.stage === 'AWAITING_CLARIFICATION' && state.pendingClarification) {
      const lower = text.toLowerCase().trim();
      if (state.pendingClarification!.type === 'VARIANT_OPTION') {
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
              state.pendingClarification!.requestedValue ||
              (state.pendingClarification as any).originalValue ||
              'Large';
            const updateRes = await cartService.updateItemVariant(cart.id, matchedTarget!, String(requestedVariant || 'Large'));
            state.pendingClarification = null;
            state.stage = 'EDITING_CART';
            const refreshedCart = await cartService.getOrCreateActiveCart(customer.id);
            const totals = await cartService.recalculateCart(cart.id);
            const targetName = matchedTarget === 'coke' ? 'Coke Zero' : 'Crispy Chicken Meal';
            const reply = localizeReplyText(
              `Got it! Updated the ${targetName} to **${requestedVariant}**${updateRes.newPrice ? ` ($${Number(updateRes.newPrice).toFixed(2)})` : ''}.\n\nYour cart total is **$${totals.total.toFixed(2)}**. Where should we deliver this? (e.g. *Home* / *3al Bet*)`,
              responseLanguage,
            );

            await saveConversationState(customer.id, state, conversationId);
            await this.appendHistory(customer.id, conversationId, text, reply);

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
            const reply = localizeReplyText(`[Shadow Simulation] Clarification resolved: Updated ${targetName}`, responseLanguage);
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
    const history = await this.getHistory(customer.id, conversationId);
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
    let customerPreferencesText = '';
    if (customer.id > 0) {
      try {
        const prefs = await customerMemoryService.getPreferences(customer.id);
        customerPreferencesText = customerMemoryService.formatPreferencesForPrompt(prefs);
      } catch {}
    }
    const systemInstruction = getGeminiSystemPrompt(
      sanitizeStateSnapshot(state),
      responseLanguage,
      customerPreferencesText
    );

    let primaryIntent: CanonicalIntent = 'GREETING';
    let actionTaken: string | undefined;
    let orderCreated: any;
    let finalText = '';
    let mutationsExecutedCount = 0;
    const recordedToolCalls: any[] = [];
    const recordedToolResults: any[] = [];
    let customerError: { errorCode?: string; errorMessage?: string; result?: unknown } | null = null;
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
          maxOutputTokens: config.ai.geminiMaxOutputTokens,
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

            const derivedErrorCode = execution.errorCode ||
              (resultHasNoCatalogMatches(toolResult) ? 'NO_CATALOG_MATCHES' : undefined) ||
              (Array.isArray(toolResult) && toolResult.length > 0 && toolResult.every((entry) => entry?.isComplete === false)
                ? 'NO_CATALOG_MATCHES'
                : undefined);
            if (derivedErrorCode && derivedErrorCode !== 'AMBIGUOUS_CART_ITEM' && getCustomerResponseCategory(derivedErrorCode, execution.error, toolResult)) {
              customerError = { errorCode: derivedErrorCode, errorMessage: execution.error, result: toolResult };
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

    if (customerError) {
      finalText = dispatchCustomerError({ ...customerError, language: responseLanguage, facts: this.errorFacts(customerError.result) })?.text || getLanguageSafeFallback(responseLanguage);
    } else if (!finalText) {
      finalText = getLanguageSafeFallback(responseLanguage);
    } else {
      // Gemini is authoritative for facts, but this deterministic boundary
      // translates common safety/status labels if a model response drifts into
      // English. Product names, merchant names, IDs, prices, and markup stay
      // untouched.
      finalText = localizeReplyText(finalText, responseLanguage);
    }

    // Gemini sometimes falls back to the old generic menu prompt even when it
    // did not understand the customer. Make uncertainty explicit and offer
    // useful next actions instead of repeating that same dead-end question.
    if (isGenericAssistanceReply(finalText)) {
      finalText = getLanguageSafeFallback(responseLanguage);
      primaryIntent = 'CLARIFICATION';
    }

    // The prompt is the primary language control. This backend boundary keeps
    // an accidental provider-language drift from reaching WhatsApp.
    if (!isResponseInSenderLanguage(responseLanguage, finalText)) {
      finalText = getLanguageSafeFallback(responseLanguage);
    }
    finalText = sanitizeCustomerOutput(finalText);
    state.lastAssistantQuestion = /[?؟]$/.test(finalText.trim()) ? finalText : state.lastAssistantQuestion;
    state.historySummary = sanitizeCustomerOutput(`${text} -> ${finalText}`).slice(-1200);

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

    const toolCallsCombined = recordedToolCalls.map((tc, idx) => ({
      name: tc.name,
      args: tc.args,
      result: recordedToolResults[idx]?.result,
    }));

    // These independent persistence operations used to run one after another
    // after Gemini finished. Run them together so response latency is bounded
    // by the slowest side effect, not their sum.
    const stateAndHistoryPromise = !options?.shadowMode && customer.id > 0
      ? Promise.all([
          saveConversationState(customer.id, state, conversationId),
          this.appendHistory(customer.id, conversationId, text, finalText),
        ])
      : Promise.resolve();

    const telemetryPromise = aiTelemetryService.recordInteraction({
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
      inboundMessageId: options?.inboundMessageId || null,
      turnCorrelationId: requestId,
    }).catch((telemetryErr) => {
      console.warn('[Gemini Service] Error recording turn telemetry:', telemetryErr);
    });

    const activeCartPromise = state.cartSummary
      ? Promise.resolve(state.cartSummary)
      : cartService.getActiveCartReadOnly(customer.id);

    const [, , activeCart] = await Promise.all([
      stateAndHistoryPromise,
      telemetryPromise,
      activeCartPromise,
    ]);

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
