import { config } from '../../config/env.js';
import { catalogService, SearchResult } from '../catalog/catalog.service.js';
import { cartService } from '../carts/cart.service.js';
import { customerService } from '../customers/customer.service.js';
import { orderService } from '../orders/order.service.js';
import { redis } from '../../database/redis.js';
import { AIProcessResult, CustomerResponseCategory, ValidatedIntent } from './ai.types.js';
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
  getPendingCartClearDecision,
  isExplicitCartClearRequest,
  isNewCartRequest,
} from './checkout-safety.js';
import {
  detectSenderLanguage,
  getLanguageSafeFallback,
  isGenericAssistanceReply,
  isResponseInSenderLanguage,
  resolveConversationLanguage,
  SenderLanguage,
} from './sender-language.js';
import { localizeReplyText } from './response-localizer.js';
import { sanitizeCustomerOutput } from './customer-output.js';
import { customerMemoryService } from './memory/customer-memory.service.js';
import { query, execute } from '../../database/db.js';
import { contextCompilerService } from './context/context-compiler.service.js';
import { taskStackService } from './context/task-stack.service.js';
import { groundedResponseVerifier } from './verification/grounded-response-verifier.js';
import { outcomeObserverService } from './learning/outcome-observer.service.js';
import { StateVersionConflictError } from './state/ai-state.types.js';
import { validateStructuredDecision } from './planning/decision.schema.js';
import { actionPolicyService } from './policy/action-policy.service.js';
import { PiiRedactor } from './telemetry/pii-redactor.js';

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

  private cartClearedReply(language: SenderLanguage): string {
    if (language === 'arabizi') return 'Tamam, faddayt l cart. Shou baddak tetlob halla2?';
    if (language === 'ar' || language === 'ar_lb') return 'تمام، فرّغت السلة. شو بدك تطلب هلّق؟';
    if (language === 'mixed') return 'تمام، I cleared your cart. What would you like to order now?';
    return 'Your cart has been cleared. What would you like to order now?';
  }

  private cartClearConfirmationReply(language: SenderLanguage, merchantName?: string | null): string {
    const merchant = merchantName ? ` ${merchantName}` : '';
    if (language === 'arabizi') return `Fi 3andak aghrad bel cart${merchant}. Baddak faddiha w tballesh cart jdid? Rodd “eh” la faddiha aw “la” la khalliha.`;
    if (language === 'ar' || language === 'ar_lb') return `عندك أغراض بالسلة${merchant}. بدك فرّغها وتبلّش سلة جديدة؟ ردّ «نعم» لفرّغها أو «لا» لتخلّيها.`;
    if (language === 'mixed') return `عندك أغراض بالسلة${merchant}. Do you want me to clear it and start a new cart? Reply yes or no.`;
    return `You still have items in your cart${merchant}. Would you like me to clear it and start a new cart? Reply yes or no.`;
  }

  private cartKeptReply(language: SenderLanguage): string {
    if (language === 'arabizi') return 'Tamam, khallayt l cart metel ma hiyye. Shou baddak ta3mel fiya?';
    if (language === 'ar' || language === 'ar_lb') return 'تمام، خلّيت السلة متل ما هي. شو بدك تعمل فيها؟';
    if (language === 'mixed') return 'تمام، I kept your cart as it is. What would you like to do next?';
    return 'Okay, I kept your cart as it is. What would you like to do next?';
  }

  private batchAddressRequiredReply(language: SenderLanguage): string {
    if (language === 'arabizi') {
      return 'L talabayn ba3don bi 7aje la 3enwen delivery. B3at l 3enwen aw location pin, w ba3den rodd "confirm both" marra tene.';
    }
    if (language === 'fr') {
      return 'Vos deux commandes ont encore besoin dâ€™une adresse de livraison. Envoyez lâ€™adresse ou votre position, puis rÃ©pondez Ã  nouveau "confirm both".';
    }
    if (language === 'ar' || language === 'ar_lb') {
      return 'الطلبان ما زالا بحاجة إلى عنوان للتوصيل. أرسل العنوان أو موقعك، ثم أرسل "confirm both" مرة أخرى.';
    }
    if (language === 'mixed') {
      return 'Both orders still need a delivery address. Please send the address or a location pin, then reply "confirm both" again.';
    }
    return 'Your two orders still need a delivery address. Please send the address or a location pin, then reply "confirm both" again.';
  }

  private merchantSwitchReply(language: SenderLanguage, merchantName: string, productName?: string): string {
    const item = productName ? ` ${productName}` : ' the selected item';
    if (language === 'arabizi') return `Tamam, faddayt l cart l adeeme w zedt${item} men ${merchantName}. Baddak tshouf l cart aw nkammel checkout?`;
    if (language === 'ar' || language === 'ar_lb') return `تمام، فرّغت السلة القديمة وضفت${item} من ${merchantName}. بدك تشوف السلة أو نكمّل للدفع؟`;
    if (language === 'mixed') return `تمام، I cleared the old cart and added${item} from ${merchantName}. Would you like to view the cart or continue to checkout?`;
    return `Done. I cleared the old cart and added${item} from ${merchantName}. Would you like to view the cart or continue to checkout?`;
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

  private batchCheckoutSummaryText(language: SenderLanguage, batch: any): string {
    const children = Array.isArray(batch?.children) ? batch.children : [];
    const lines = children.map((child: any) =>
      `Talab ${child.child_index} - ${child.merchant_name}: $${Number(child.total || 0).toFixed(2)} (delivery $${Number(child.delivery_fee || 0).toFixed(2)})`,
    );
    if (language === 'arabizi') {
      return sanitizeCustomerOutput(`Tamam, thabbanna l 3enwen lal talabayn.\n\nHayda molakhass l talabayn:\n${lines.join('\n')}\n\nRodd "confirm both" ta n2akked l talabayn sawa, aw "confirm 1" / "confirm 2".`);
    }
    return sanitizeCustomerOutput(`Delivery address confirmed for both orders.\n\n${lines.join('\n')}\n\nReply "confirm both" to place both orders, or "confirm 1" / "confirm 2".`);
  }

  private async getHistory(customerId: number, conversationId: number | null): Promise<{ role: 'user' | 'model'; text: string }[]> {
    const key = `ai:history:${conversationId || customerId}`;
    // MySQL is the durable source of truth. Redis is only a cache, so a
    // restart/expiry must not erase the meaning of an unfinished task.
    try {
      if (conversationId) {
        const rows = await query<any[]>(
          `SELECT direction, sender_type, text_body
           FROM messages
           WHERE conversation_id = ? AND text_body IS NOT NULL AND text_body <> ''
           ORDER BY id DESC LIMIT 12`,
          [conversationId]
        );
        if (rows.length > 0) {
          const durable = rows.reverse().map((row) => ({
            role: row.direction === 'INBOUND' || row.sender_type === 'CUSTOMER' ? 'user' as const : 'model' as const,
            text: String(row.text_body || '').slice(0, this.maxCustomerMessageLength),
          }));
          await redis.set(key, JSON.stringify(durable), 86400).catch(() => undefined);
          return durable;
        }
      }
    } catch {}

    try {
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(-12);
      }
    } catch {}
    return [];
  }

  private async appendHistory(customerId: number, conversationId: number | null, userText: string, modelText: string): Promise<void> {
    try {
      const history = await this.getHistory(customerId, conversationId);
      const last = history[history.length - 1];
      // The inbound message is persisted before Gemini is called. Avoid
      // duplicating it when the Redis cache is rebuilt from MySQL.
      if (!last || last.role !== 'user' || last.text !== userText) {
        history.push({ role: 'user', text: userText });
      }
      history.push({ role: 'model', text: modelText });
      const trimmed = history.slice(-12);
      await redis.set(`ai:history:${conversationId || customerId}`, JSON.stringify(trimmed), 86400);
    } catch (err) {
      console.warn('[Gemini Service] Error updating history in Redis:', err);
    }
  }

  private async safeSaveState(customerId: number, state: AIConversationState, conversationId: number | null): Promise<void> {
    try {
      await saveConversationState(customerId, state, conversationId, { enforceCas: true });
    } catch (err) {
      if (err instanceof StateVersionConflictError) {
        console.warn(`[Gemini Service] CAS conflict on state version ${err.expectedVersion}, reloading state to retry save...`);
        const latest = await loadConversationState(customerId, conversationId);
        latest.lastAssistantQuestion = state.lastAssistantQuestion;
        latest.preferredLanguage = state.preferredLanguage;
        latest.turnIndex = (latest.turnIndex || 0) + 1;
        latest.historySummary = state.historySummary;
        latest.cartSummary = state.cartSummary;
        latest.stage = state.stage;
        latest.nextRequiredAction = state.nextRequiredAction;
        latest.expectedEntity = state.expectedEntity;
        latest.pendingProductCategory = state.pendingProductCategory;
        latest.pendingProductMerchantBranchId = state.pendingProductMerchantBranchId;
        latest.addressDraft = state.addressDraft;
        latest.pendingOrderBatchId = state.pendingOrderBatchId;
        latest.pendingClarification = state.pendingClarification;
        latest.pendingMerchantSwitch = state.pendingMerchantSwitch;
        latest.selectedAddress = state.selectedAddress;
        latest.selectedMerchant = state.selectedMerchant;
        latest.cartSummary = state.cartSummary;
        latest.awaitingConfirmation = state.awaitingConfirmation;
        latest.checkoutFingerprint = state.checkoutFingerprint;
        await saveConversationState(customerId, latest, conversationId, { enforceCas: true });
      } else {
        throw err;
      }
    }
  }

  private async executeTool(
    toolName: string,
    args: Record<string, any>,
    customerId: number,
    state: AIConversationState,
    mutationCountThisTurn: number,
    options?: { shadowMode?: boolean; conversationId?: number; inboundMessageId?: number },
    userMessage?: string
  ): Promise<ToolExecutionResult> {
    const conversationId = options?.conversationId || state.conversationId;
    const inboundMessageId = options?.inboundMessageId;
    const idempotencyKey = (inboundMessageId && isMutatingTool(toolName))
      ? `msg_${inboundMessageId}_${toolName}`
      : null;

    let receiptClaimed = false;

    if (conversationId && idempotencyKey && !options?.shadowMode) {
      const loadExistingReceipt = async (): Promise<ToolExecutionResult | null> => {
        const rows = await query<any[]>(
          `SELECT action_status, response_payload
             FROM conversation_mutation_receipts
            WHERE conversation_id = ? AND idempotency_key = ?
            LIMIT 1`,
          [conversationId, idempotencyKey],
        );
        if (rows.length === 0) return null;

        const stored = rows[0];
        if (stored.response_payload) {
          try {
            return (typeof stored.response_payload === 'string'
              ? JSON.parse(stored.response_payload)
              : stored.response_payload) as ToolExecutionResult;
          } catch {
            return {
              toolName,
              success: false,
              error: 'The previous action receipt could not be read safely.',
              errorCode: 'MUTATION_RECEIPT_INVALID',
              stateChanged: false,
            };
          }
        }

        // A process can crash after a business operation starts. Never repeat
        // that mutation until an operator/reconciler can prove its outcome.
        return {
          toolName,
          success: false,
          error: 'The previous action is still being reconciled. No action was repeated.',
          errorCode: 'MUTATION_RECONCILIATION_REQUIRED',
          stateChanged: false,
        };
      };

      const existing = await loadExistingReceipt();
      if (existing) return existing;

      try {
        await execute(
          `INSERT INTO conversation_mutation_receipts
            (conversation_id, idempotency_key, action_name, tool_name, action_status, request_payload, created_at)
           VALUES (?, ?, ?, ?, 'PENDING', ?, NOW())`,
          [conversationId, idempotencyKey, toolName, toolName, JSON.stringify(PiiRedactor.redactObject(args || {}))],
        );
        receiptClaimed = true;
      } catch (err: any) {
        if (err?.code !== 'ER_DUP_ENTRY' && Number(err?.errno) !== 1062) throw err;
        const raced = await loadExistingReceipt();
        if (raced) return raced;
        throw err;
      }
    }

    let execution: ToolExecutionResult;
    try {
      execution = await aiToolsExecutor.executeTool(
        toolName,
        args,
        customerId,
        state,
        mutationCountThisTurn,
        options,
        userMessage,
      );
    } catch (error) {
      if (receiptClaimed && conversationId && idempotencyKey) {
        await execute(
          `UPDATE conversation_mutation_receipts
              SET action_status = 'FAILED', response_payload = ?
            WHERE conversation_id = ? AND idempotency_key = ?`,
          [
            JSON.stringify({
              toolName,
              success: false,
              error: 'The requested action could not be completed safely.',
              errorCode: 'MUTATION_EXECUTION_FAILED',
              stateChanged: false,
            }),
            conversationId,
            idempotencyKey,
          ],
        ).catch(() => undefined);
      }
      throw error;
    }

    if (receiptClaimed && conversationId && idempotencyKey) {
      // A mutation is not reported as complete until the durable receipt is
      // written. A failed receipt leaves PENDING, which fails closed on retry.
      await execute(
        `UPDATE conversation_mutation_receipts
            SET action_status = ?, response_payload = ?
          WHERE conversation_id = ? AND idempotency_key = ?`,
        [
          execution.success ? 'SUCCESS' : 'REJECTED',
          JSON.stringify(PiiRedactor.redactObject(execution)),
          conversationId,
          idempotencyKey,
        ],
      );
    }

    return execution;
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
      /** Pre-turn snapshot used by shadow evaluation to avoid seeing stable mutations. */
      stateSnapshot?: AIConversationState;
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

    const state = customer.id > 0
      ? options?.stateSnapshot
        ? JSON.parse(JSON.stringify(options.stateSnapshot)) as AIConversationState
        : await loadConversationState(customer.id, conversationId)
      : createInitialState(-1, 'arabizi', conversationId);
    const previousTurnCount = state.turnIndex || 0;
    state.conversationId = conversationId;
    state.turnIndex = (state.turnIndex || 0) + 1;
    const stateBeforeSnapshot = sanitizeStateSnapshot(state);
    const startTime = Date.now();
    const text = this.clampString(messageText, this.maxCustomerMessageLength);

    if (!text) {
      const reply =
        'I received your message, but it was empty. Please send what you would like to order, a voice note, a clear product photo, or a location pin.';
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return {
        replyText: reply,
        intent: 'GENERAL_GREETING',
        confidence: 0.99,
        responseCategory: 'CLARIFICATION',
      };
    }

    // Keep the established conversation language for short contextual replies
    // such as "yes", "view cart", and option numbers. A substantive new
    // message can still intentionally switch the conversation language.
    let rememberedLanguage: SenderLanguage | null = null;
    if (customer.id > 0 && previousTurnCount === 0) {
      try {
        rememberedLanguage = (await customerMemoryService.getPreferences(customer.id)).preferredLanguage as SenderLanguage || null;
      } catch {}
    }
    const responseLanguage: SenderLanguage = resolveConversationLanguage(text, rememberedLanguage || state.preferredLanguage);
    if (customer.id > 0) {
      state.preferredLanguage = responseLanguage;
      state.lastProcessedMessageId = options?.inboundMessageId || state.lastProcessedMessageId || null;
      if (!options?.shadowMode) {
        customerMemoryService.observeAndLearn(customer.id, text, requestId, { preferredLanguage: responseLanguage }).catch(() => {});
      }
    }

    // A lone uninterpretable character cannot select a product or authorize a
    // mutation. Keep the task state and ask one neutral, language-matched
    // clarification without calling any tools.
    if (this.isUnintelligibleStandalone(text, state)) {
      const reply = dispatchCustomerError({ errorCode: 'UNINTELLIGIBLE_MESSAGE', language: responseLanguage })!.text;
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CLARIFICATION_REQUIRED' as ValidatedIntent, confidence: 0.99, responseCategory: 'CLARIFICATION', shadowExecution: !!options?.shadowMode };
    }

    // A greeting must not discard a pending address/confirmation/product task.
    if (this.isGreeting(text) && state.nextRequiredAction && state.lastAssistantQuestion) {
      const reply = sanitizeCustomerOutput(`${responseLanguage === 'arabizi' ? 'Ahlan. ' : responseLanguage === 'fr' ? 'Bonjour. ' : 'Hello. '}${state.lastAssistantQuestion}`);
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CONTINUE_PENDING_TASK' as ValidatedIntent, confidence: 0.99, responseCategory: 'CLARIFICATION', shadowExecution: !!options?.shadowMode };
    }

    const isAddressStage = ['SELECTING_ADDRESS', 'ADDRESS_DRAFT_REVIEW'].includes(state.stage);
    const isBatchAwaitingAddress = Boolean(state.pendingOrderBatchId) &&
      (state.nextRequiredAction === 'SELECT_BATCH_ADDRESS' || state.expectedEntity === 'delivery_address');
    const isAddressShaped = mediaType === 'location' || /(?:saida|sidon|abra|street|road|building|floor|near|behind|\d{3,}|شارع|صيدا|عبرا)/iu.test(text);
    if ((isAddressStage || isBatchAwaitingAddress) && isAddressShaped) {
      const execution = await this.executeTool('capture_delivery_address', { raw_address: text }, customer.id, state, 0, options, text);
      const reply = execution.success
        ? (state.pendingOrderBatchId
          ? this.batchCheckoutSummaryText(responseLanguage, execution.result?.batch)
          : sanitizeCustomerOutput(`${responseLanguage === 'arabizi'
          ? 'Fhemet 3enwenak. Ma fi talab 2abel l ta2kid l saree7.'
          : responseLanguage === 'fr'
            ? 'J’ai compris votre adresse. Aucune commande ne sera créée avant votre confirmation explicite.'
            : responseLanguage === 'ar' || responseLanguage === 'ar_lb' || responseLanguage === 'mixed'
              ? 'تم فهم عنوانك. لن يتم إنشاء طلب قبل تأكيدك الصريح.'
            : 'I understood your delivery address. No order will be created before your explicit confirmation.'}\n\n${this.checkoutSummaryText(responseLanguage, execution.cartSummary)}`))
        : dispatchCustomerError({ errorCode: execution.errorCode, errorMessage: execution.error, result: execution.result, language: responseLanguage, facts: this.errorFacts(execution.result) })?.text || getLanguageSafeFallback(responseLanguage);
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CAPTURE_DELIVERY_ADDRESS' as ValidatedIntent, confidence: 0.99, responseCategory: execution.success ? 'CHECKOUT_SUMMARY' : ((getCustomerResponseCategory(execution.errorCode, execution.error, execution.result) || 'ADDRESS_VALIDATION') as CustomerResponseCategory), cartSummary: execution.cartSummary, shadowExecution: !!options?.shadowMode };
    }

    if (/(?:where is (?:my )?order|order status|wein (?:el )?order|track(?:ing)? (?:my )?order|suivi.*commande)/iu.test(text)) {
      if (conversationId && state.stage !== 'IDLE' && !options?.shadowMode) {
        taskStackService.pushTask(conversationId, {
          taskType: 'ORDER_STATUS',
          nextRequiredAction: null,
          lastQuestion: text,
          sourceTurn: state.turnIndex || 1,
          context: { suspendedStage: state.stage, suspendedQuestion: state.lastAssistantQuestion },
        }).catch((err) => console.warn('[Gemini Service] Task stack push warning:', err));
      }
      const execution = await this.executeTool('get_order_status', {}, customer.id, state, 0, options, text);
      const result: any = execution.result || {};
      const reply = execution.success
        ? sanitizeCustomerOutput(responseLanguage === 'arabizi'
          ? `Talabak ${result.order_number} ${result.merchant_name ? `men ${result.merchant_name} ` : ''}hal2ad 7alto ${result.status}.`
          : responseLanguage === 'fr'
            ? `Votre commande ${result.order_number}${result.merchant_name ? ` de ${result.merchant_name}` : ''} est actuellement ${result.status}.`
            : responseLanguage === 'ar' || responseLanguage === 'ar_lb'
              ? `طلبك ${result.order_number}${result.merchant_name ? ` من ${result.merchant_name}` : ''} حالته الآن ${result.status}.`
              : `Your order ${result.order_number}${result.merchant_name ? ` from ${result.merchant_name}` : ''} is currently ${result.status}.`)
        : dispatchCustomerError({ errorCode: execution.errorCode, errorMessage: execution.error, result, language: responseLanguage, facts: this.errorFacts(result) })?.text || getLanguageSafeFallback(responseLanguage);
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'ORDER_STATUS' as ValidatedIntent, confidence: 0.99, responseCategory: execution.success ? 'NORMAL' : ((getCustomerResponseCategory(execution.errorCode, execution.error, result) || 'NO_ACTIVE_ORDER') as CustomerResponseCategory), shadowExecution: !!options?.shadowMode };
    }

    const currentActiveCart = await cartService.getActiveCartReadOnly(customer.id);
    const hasCartItems = Boolean(currentActiveCart?.items?.length);
    const directClear = isExplicitCartClearRequest(text) || /\b(?:delete|remove)\s+(?:it|them|all|the cart)\b/iu.test(text);

    // An explicit clear request is deterministic and must not wait for a
    // model call. It also takes precedence over an old merchant-switch offer.
    if (hasCartItems && directClear) {
      const execution = await this.executeTool('clear_cart', { confirmation: true }, customer.id, state, 0, options, text);
      const reply = execution.success ? this.cartClearedReply(responseLanguage) : getLanguageSafeFallback(responseLanguage);
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CLEAR_CART' as ValidatedIntent, confidence: 0.99, responseCategory: 'NORMAL', cartSummary: null, shadowExecution: !!options?.shadowMode };
    }

    // "New cart" is intentionally a confirmation flow when items exist. The
    // next short reply is resolved locally against this exact question.
    if (hasCartItems && isNewCartRequest(text)) {
      state.pendingMerchantSwitch = null;
      state.nextRequiredAction = 'CONFIRM_CART_CLEAR';
      state.expectedEntity = 'cart_clear_confirmation';
      state.lastAssistantQuestion = this.cartClearConfirmationReply(responseLanguage, currentActiveCart?.merchant_name);
      if (state.stage === 'AWAITING_MERCHANT_SWITCH') state.stage = 'IDLE';
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, state.lastAssistantQuestion);
      }
      return { replyText: state.lastAssistantQuestion, intent: 'CLARIFICATION_REQUIRED' as ValidatedIntent, confidence: 0.99, responseCategory: 'CLARIFICATION', shadowExecution: !!options?.shadowMode };
    }

    if (state.nextRequiredAction === 'CONFIRM_CART_CLEAR') {
      const decision = getPendingCartClearDecision(text);
      let reply: string;
      if (decision === 'CONFIRM') {
        const execution = await this.executeTool('clear_cart', { confirmation: true }, customer.id, state, 0, options, 'clear cart');
        reply = execution.success ? this.cartClearedReply(responseLanguage) : getLanguageSafeFallback(responseLanguage);
      } else if (decision === 'DECLINE') {
        state.nextRequiredAction = null;
        state.expectedEntity = null;
        state.stage = 'EDITING_CART';
        reply = this.cartKeptReply(responseLanguage);
      } else {
        reply = this.cartClearConfirmationReply(responseLanguage, currentActiveCart?.merchant_name);
      }
      state.lastAssistantQuestion = reply;
      if (!options?.shadowMode && customer.id > 0) {
        await this.safeSaveState(customer.id, state, conversationId);
        await this.appendHistory(customer.id, conversationId, text, reply);
      }
      return { replyText: reply, intent: 'CLARIFICATION_REQUIRED' as ValidatedIntent, confidence: 0.99, responseCategory: 'CLARIFICATION', shadowExecution: !!options?.shadowMode };
    }

    // A pending merchant switch owns simple approvals/rejections. Resolve it
    // before Gemini sees a bare "yes" or "no", so the answer cannot lose its
    // referent or get mistaken for a new order confirmation.
    if (state.pendingMerchantSwitch) {
      const approved = aiToolsExecutor.isExplicitMerchantSwitchApproval(text, true);
      const rejected = getPendingCartClearDecision(text) === 'DECLINE';
      if (approved || rejected) {
        const pending = state.pendingMerchantSwitch;
        const execution = approved
          ? await this.executeTool('switch_merchant_confirm', { confirm_switch: true, confirmation_phrase: text }, customer.id, state, 0, options, text)
          : await this.executeTool('switch_merchant_reject', { reject_switch: true }, customer.id, state, 0, options, text);
        const reply = execution.success
          ? approved
            ? this.merchantSwitchReply(responseLanguage, pending.newMerchantName, pending.pendingProduct?.productNameQuery)
            : this.cartKeptReply(responseLanguage)
          : getLanguageSafeFallback(responseLanguage);
        state.lastAssistantQuestion = reply;
        if (!options?.shadowMode && customer.id > 0) {
          await this.safeSaveState(customer.id, state, conversationId);
          await this.appendHistory(customer.id, conversationId, text, reply);
        }
        return { replyText: reply, intent: approved ? 'ADD_TO_CART' as ValidatedIntent : 'CLARIFICATION_REQUIRED' as ValidatedIntent, confidence: 0.99, responseCategory: approved ? 'NORMAL' : 'CLARIFICATION', cartSummary: execution.cartSummary, shadowExecution: !!options?.shadowMode };
      }
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

            await this.safeSaveState(customer.id, state, conversationId);
            await this.appendHistory(customer.id, conversationId, text, reply);

            return {
              intent: 'CLARIFICATION_RESOLVED',
              confidence: 0.98,
              actionTaken: 'UPDATED_VARIANT',
              replyText: reply,
              responseCategory: 'NORMAL',
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
              responseCategory: 'NORMAL',
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
    let extraContextBlock: string | undefined;
    if (customer.id > 0) {
      try {
        const prefs = await customerMemoryService.getPreferences(customer.id, { readOnly: !!options?.shadowMode });
        customerPreferencesText = customerMemoryService.formatPreferencesForPrompt(prefs);
        const compiled = await contextCompilerService.compileContext({
          customerId: customer.id,
          conversationId: conversationId || null,
          state,
          inboundText: text,
          detectedLanguage: responseLanguage,
          promptVersion: PROMPT_VERSION,
          toolSchemaVersion: '2.0.0',
          behaviorContractVersion: BEHAVIOR_CONTRACT_VERSION,
          readOnly: !!options?.shadowMode,
        });
        const recentTurns = compiled.recentRelevantTurns
          .map((turn) => `${turn.role === 'user' ? 'Customer' : 'Assistant'}: ${turn.text}`)
          .join('\n');
        const durableFacts = [
          compiled.summary.formattedText,
          recentTurns ? `[RECENT DURABLE TURNS]\n${recentTurns}` : null,
          compiled.facts.activeOrders.length > 0
            ? `[VERIFIED ACTIVE ORDERS]\n${compiled.facts.activeOrders.map((order) => `${order.orderNumber}: ${order.status}`).join('\n')}`
            : null,
          compiled.facts.selectedAddress ? `[SELECTED ADDRESS]\n${compiled.facts.selectedAddress.label || ''}` : null,
          compiled.facts.pendingBatch
            ? `[PENDING MULTI-ORDER BATCH]\n${compiled.facts.pendingBatch.children.map((child: any) => `${child.index}. ${child.merchantName}: $${Number(child.total || 0).toFixed(2)} (${child.status})`).join('\n')}`
            : null,
          compiled.memorySuggestions.length > 0
            ? `[UNCONFIRMED MEMORY SUGGESTIONS]\n${compiled.memorySuggestions.join('\n')}`
            : null,
        ].filter(Boolean).join('\n\n');
        extraContextBlock = [compiled.promptContextBlock, durableFacts].filter(Boolean).join('\n\n');
      } catch (err: any) {
        console.warn('[Gemini Service] Context compilation warning:', err.message);
      }
    }
    const systemInstruction = getGeminiSystemPrompt(
      sanitizeStateSnapshot(state),
      responseLanguage,
      customerPreferencesText,
      extraContextBlock
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
          // The customer’s explicit confirmation is the authorization, not a
          // model-invented argument. Preserve the raw turn for the policy
          // decision just as the executor does before its own validation.
          const policyToolArgs = (toolName === 'confirm_and_create_order' || toolName === 'confirm_order_batch') && !toolArgs.confirmation_phrase
            ? { ...toolArgs, confirmation_phrase: text }
            : toolArgs;
          const decisionValidation = validateStructuredDecision({
            reply_language: responseLanguage,
            task_relation: state.nextRequiredAction ? 'ANSWER_TO_PENDING_TASK' : 'NEW_TASK',
            intent: TOOL_INTENT_MAP[toolName as ControlledTool] || 'UNKNOWN',
            response_category: 'NORMAL',
            decision: 'CALL_TOOL',
            tool: { name: toolName, arguments: policyToolArgs },
            risk: isMutatingTool(toolName) ? 'MUTATION_REVERSIBLE' : 'SAFE_READ_ONLY',
          });
          const policyCart = decisionValidation.success
            ? await cartService.getActiveCartReadOnly(customer.id)
            : null;
          const policy = decisionValidation.success
            ? actionPolicyService.evaluatePolicy(decisionValidation.decision!, state, {
              hasActiveCart: Boolean(policyCart?.items?.length),
              hasSelectedAddress: Boolean(state.selectedAddress),
              awaitingConfirmation: state.awaitingConfirmation,
              checkoutFingerprint: state.checkoutFingerprint,
              isExplicitCartClearRequested: isExplicitCartClearRequest(text),
            })
            : { allowed: false, violationCode: 'INVALID_AI_DECISION', violationMessage: decisionValidation.errors?.join('; ') || 'Invalid AI decision.' };

          // Maintain ONE mutation counter across all Gemini tool rounds for the complete turn
          if (!policy.allowed) {
            toolResult = {
              success: false,
              error: policy.violationMessage || 'AI_DECISION_REJECTED',
              message: policy.rejectionReason || 'I need a safe, explicit instruction before I can complete that action.',
            };
            toolErrorCode = policy.violationCode || 'AI_DECISION_REJECTED';
          } else if (isMutatingTool(toolName) && mutationsExecutedCount >= 1) {
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

    if (customerError?.errorCode === 'BATCH_ADDRESS_REQUIRED') {
      // Do not let a model apology hide an actionable batch checkout step.
      finalText = this.batchAddressRequiredReply(responseLanguage);
    } else if (customerError && !finalText) {
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
    const effectiveLang = (state.preferredLanguage && state.preferredLanguage !== 'other') ? state.preferredLanguage : responseLanguage;
    const isLangMatch = isResponseInSenderLanguage(responseLanguage, finalText) || isResponseInSenderLanguage(effectiveLang, finalText);
    if (!isLangMatch) {
      finalText = getLanguageSafeFallback(responseLanguage);
    }
    finalText = sanitizeCustomerOutput(finalText);
    state.lastAssistantQuestion = /[?؟]$/.test(finalText.trim()) ? finalText : state.lastAssistantQuestion;
    const previousSummary = state.historySummary ? `${state.historySummary}\n` : '';
    // Keep a bounded rolling summary so long conversations retain intent and
    // corrections even after the short Redis replay window expires.
    state.historySummary = sanitizeCustomerOutput(`${previousSummary}${text} -> ${finalText}`).slice(-4000);

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
    const responseCategory: CustomerResponseCategory = customerError
      ? ((getCustomerResponseCategory(customerError.errorCode, customerError.errorMessage, customerError.result) || 'NORMAL') as CustomerResponseCategory)
      : primaryIntent === 'CLARIFICATION' || primaryIntent === 'CONTINUE_PENDING_TASK'
        ? 'CLARIFICATION'
        : recordedToolCalls.some((entry) => entry.name === 'create_multi_order_plan' || entry.name === 'review_multi_order_plan')
          ? 'MULTI_ORDER_PLAN'
        : primaryIntent === 'ORDER_STATUS' && recordedToolResults.some((entry) => getCustomerResponseCategory(entry.errorCode, undefined, entry.result) === 'NO_ACTIVE_ORDER')
          ? 'NO_ACTIVE_ORDER'
          : primaryIntent === 'CONFIRM_ORDER'
            ? 'CHECKOUT_SUMMARY'
            : 'NORMAL';
    const totalTokens = promptTokensTotal + candidatesTokensTotal;
    const costUsd = calculateGeminiCost(promptTokensTotal, candidatesTokensTotal);
    const detectedLang = detectLanguage(text);
    const turnSuccess = !recordedToolResults.some((r) => r.result && r.result.success === false);

    const facts = this.errorFacts(recordedToolResults[0]?.result);
    const verification = groundedResponseVerifier.verify({
      responseText: finalText,
      targetLanguage: responseLanguage,
      verifiedFacts: {
        productNames: facts.itemName ? [facts.itemName] : facts.verifiedOptions,
        addressLabels: facts.addressLabel ? [facts.addressLabel] : undefined,
        orderNumbers: facts.orderNumber ? [facts.orderNumber] : undefined,
      },
      toolExecutionSuccess: turnSuccess,
      toolName: recordedToolCalls[recordedToolCalls.length - 1]?.name,
    });
    if (!verification.passed && verification.sanitizedText) {
      finalText = verification.sanitizedText;
    }

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
          this.safeSaveState(customer.id, state, conversationId),
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

    if (conversationId && !options?.shadowMode) {
      const isUnsafe = recordedToolCalls.some((tc) => tc.name === 'confirm_and_create_order' && state.stage !== 'AWAITING_CONFIRMATION');
      const isClaimedSuccessAfterFailure = !turnSuccess && /(?:confirmed|created|order placed|تم تأكيد)/i.test(finalText);

      outcomeObserverService.recordOutcome({
        conversationId,
        turnIndex: state.turnIndex || 1,
        inboundMessageId: options?.inboundMessageId || null,
        requestId,
        customerReaction: 'ACCEPTED',
        toolSuccess: turnSuccess,
        isUnsafeMutationAttempted: isUnsafe,
        isClaimedSuccessAfterFailure,
        latencyMs: Date.now() - startTime,
        observedSignals: {
          primaryIntent,
          toolCalls: recordedToolCalls.map((tc) => tc.name),
          verificationPassed: verification.passed,
          violations: verification.violations,
        },
      }).catch((err) => console.warn('[Gemini Service] Error recording outcome:', err.message));

      await execute(
        `INSERT INTO conversation_ai_events (
          public_id, conversation_id, turn_index, sequence_no, inbound_message_id,
          request_id, event_type, state_version_before, state_version_after,
          sanitized_payload_json, prompt_version, tool_schema_version, model_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          randomUUID(),
          conversationId,
          state.turnIndex || 1,
          recordedToolCalls.length + 1,
          options?.inboundMessageId || null,
          requestId,
          'TURN_COMPLETED',
          Number(stateBeforeSnapshot.stateVersion || 0),
          Number(state.stateVersion || stateBeforeSnapshot.stateVersion || 0),
          JSON.stringify(PiiRedactor.redactObject({
            customerMessage: text,
            replyText: finalText,
            intent: primaryIntent,
            responseCategory,
            actionTaken: actionTaken || null,
            language: responseLanguage,
            toolCalls: recordedToolCalls,
            latencyMs: Date.now() - startTime,
            tokens: { prompt: promptTokensTotal, candidates: candidatesTokensTotal },
          })),
          PROMPT_VERSION,
          '2.0.0',
          model,
        ]
      );
    }

    return {
      replyText: finalText,
      intent: legacyIntent as ValidatedIntent,
      confidence: 0.95,
      responseCategory,
      actionTaken,
      cartSummary: activeCart,
      orderCreated,
      shadowExecution: options?.shadowMode || false,
    };
  }
}

export const geminiService = new GeminiService();
