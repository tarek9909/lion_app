import { query } from '../../../database/db.js';
import { AIConversationState } from '../state/ai-state.types.js';
import { taskStackService, ConversationTask } from './task-stack.service.js';
import { conversationSummaryService, ConversationSummary } from './conversation-summary.service.js';
import { customerMemoryService, CustomerMemoryPreferences } from '../memory/customer-memory.service.js';
import { approvedCaseRetrieverService, ApprovedCase } from '../learning/approved-case-retriever.service.js';
import { cartService } from '../../carts/cart.service.js';
import { orderService } from '../../orders/order.service.js';

export interface AuthoritativeContext {
  conversation: {
    id: number | null;
    turn: number;
    stateVersion: number;
    language: {
      established: string;
      latestDetected: string;
      latestIsContextual: boolean;
      replyLanguage: string;
    };
  };
  activeTask: ConversationTask | null;
  taskStack: ConversationTask[];
  facts: {
    cart: any | null;
    selectedAddress: any | null;
    activeOrders: any[];
    pendingBatch: any | null;
  };
  summary: {
    customerGoal: string | null;
    confirmedConstraints: string[];
    decisions: string[];
    corrections: string[];
    unresolved: string[];
    sourceTurnRange: [number, number];
    formattedText: string;
  };
  recentRelevantTurns: Array<{ role: 'user' | 'assistant'; text: string; turnIndex?: number }>;
  confirmedMemory: string[];
  memorySuggestions: string[];
  approvedExamples: ApprovedCase[];
  promptContextBlock: string;
  versions: {
    promptVersion: string;
    toolSchemaVersion: string;
    behaviorContractVersion: string;
    contextCompilerVersion: string;
  };
}

export class ContextCompilerService {
  readonly version = '1.0.0';

  async compileContext(options: {
    customerId: number;
    conversationId: number | null;
    state: AIConversationState;
    inboundText: string;
    detectedLanguage: string;
    promptVersion?: string;
    toolSchemaVersion?: string;
    behaviorContractVersion?: string;
  }): Promise<AuthoritativeContext> {
    const {
      customerId,
      conversationId,
      state,
      detectedLanguage,
    } = options;
    const promptVersion = options.promptVersion || '2026-09-16.v5';
    const toolSchemaVersion = options.toolSchemaVersion || '2.0.0';
    const behaviorContractVersion = options.behaviorContractVersion || '2.0.0';

    // 1. Task Stack & Active Task
    let activeTask: ConversationTask | null = null;
    let taskStack: ConversationTask[] = [];
    if (conversationId) {
      activeTask = await taskStackService.getActiveTask(conversationId);
      taskStack = await taskStackService.getTaskStack(conversationId);
    }

    // 2. Database truth for cart, address, orders
    let cartFacts: any = null;
    try {
      const activeCart = await cartService.getOrCreateActiveCart(customerId);
      if (activeCart) {
        cartFacts = {
          cartId: activeCart.id,
          merchantId: activeCart.merchant_branch_id,
          merchantName: activeCart.merchant_name,
          itemsCount: (activeCart.items || []).length,
          items: (activeCart.items || []).map((i: any) => ({
            name: i.product_name,
            quantity: i.quantity,
            variant: i.variant_name,
            notes: i.customer_notes,
            totalUsd: i.total_price || i.total_price_usd,
          })),
          subtotalUsd: activeCart.subtotal,
          deliveryFeeUsd: activeCart.estimated_delivery_fee,
          totalUsd: activeCart.estimated_total,
        };
      }
    } catch {}

    let activeOrders: any[] = [];
    try {
      const orders = await query<any[]>(
        `SELECT o.id, o.order_number, o.status, o.total as total_usd, m.name as merchant_name
         FROM orders o
         LEFT JOIN merchant_branches mb ON mb.id = o.merchant_branch_id
         LEFT JOIN merchants m ON m.id = mb.merchant_id
         WHERE o.customer_id = ?
         ORDER BY o.id DESC LIMIT 3`,
        [customerId]
      );
      activeOrders = (orders || [])
        .filter((o: any) => !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status))
        .map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          merchantName: o.merchant_name,
          totalUsd: o.total_usd,
        }));
    } catch {}

    // 3. Grounded incremental summary
    let summary: ConversationSummary | null = null;
    if (conversationId) {
      summary = await conversationSummaryService.getLatestSummary(conversationId);
    }

    // 4. Durable relevant turns from MySQL messages table
    const recentRelevantTurns = await this.getDurableTurns(conversationId, customerId, 6);

    // 5. Customer memory: Strictly split confirmed preferences from suggestions
    const prefs = await customerMemoryService.getPreferences(customerId);
    const confirmedMemory: string[] = [];
    const memorySuggestions: string[] = [];

    if (prefs) {
      if (prefs.dietaryPreferences?.length) {
        confirmedMemory.push(`Dietary: ${prefs.dietaryPreferences.join(', ')}`);
      }
      if (prefs.excludedIngredients?.length) {
        confirmedMemory.push(`Always avoid: ${prefs.excludedIngredients.join(', ')}`);
      }
      if (prefs.favoriteCuisines?.length) {
        confirmedMemory.push(`Favorite cuisines: ${prefs.favoriteCuisines.join(', ')}`);
      }
      if (prefs.deliveryLandmarks?.length) {
        confirmedMemory.push(`Saved landmarks: ${prefs.deliveryLandmarks.join(', ')}`);
      }
      if (prefs.specialInstructions?.length) {
        confirmedMemory.push(`Instructions: ${prefs.specialInstructions.join(', ')}`);
      }

      // Unconfirmed structured items
      const unconfirmed = (prefs.memoryItems || []).filter(
        (m) => m.confirmationStatus === 'UNCONFIRMED_SUGGESTION'
      );
      for (const item of unconfirmed) {
        memorySuggestions.push(`Suggestion (Unconfirmed): ${item.type} "${item.item}"`);
      }
    }

    // 6. Approved few-shot dialogue cases
    const approvedExamples = await approvedCaseRetrieverService.getRelevantCases({
      stage: state.stage || 'IDLE',
      language: detectedLanguage,
      limit: 3,
    });

    // 7. Active Saida Partners & Directory
    let directoryBlock = '';
    try {
      const merchants = await query<any[]>(
        `SELECT m.id, m.name, m.merchant_type, mb.address_line, mb.estimated_prep_time_minutes,
                COALESCE(dz.base_delivery_fee, 1.50) as delivery_fee,
                GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as categories
         FROM merchants m
         JOIN merchant_branches mb ON mb.merchant_id = m.id AND mb.status = 'ACTIVE'
         LEFT JOIN delivery_zones dz ON dz.id = mb.delivery_zone_id
         LEFT JOIN categories c ON c.merchant_id = m.id
         WHERE m.status = 'ACTIVE'
         GROUP BY m.id, mb.id, mb.address_line, mb.estimated_prep_time_minutes, dz.base_delivery_fee
         ORDER BY m.name ASC`
      );
      if (merchants && merchants.length > 0) {
        directoryBlock = 'Available Saida Partners & Options:\n' + merchants.map((m: any) =>
          `- ${m.name} (${m.merchant_type}): ${m.categories || 'Food & beverages'} (Delivery: $${Number(m.delivery_fee).toFixed(2)} | ~${m.estimated_prep_time_minutes || 20} mins)`
        ).join('\n');
      }
    } catch {}

    return {
      conversation: {
        id: conversationId,
        turn: state.turnIndex || 1,
        stateVersion: state.stateVersion || 1,
        language: {
          established: state.preferredLanguage || 'arabizi',
          latestDetected: detectedLanguage,
          latestIsContextual: false,
          replyLanguage: detectedLanguage || state.preferredLanguage || 'arabizi',
        },
      },
      activeTask,
      taskStack,
      facts: {
        cart: cartFacts,
        selectedAddress: state.selectedAddress || null,
        activeOrders,
        pendingBatch: null,
      },
      summary: {
        customerGoal: summary?.customerGoal || null,
        confirmedConstraints: summary?.confirmedConstraints || [],
        decisions: summary?.decisions || [],
        corrections: summary?.corrections || [],
        unresolved: summary?.unresolved || [],
        sourceTurnRange: [summary?.sourceTurnStart || 1, summary?.sourceTurnEnd || 1],
        formattedText: conversationSummaryService.formatSummaryForPrompt(summary),
      },
      recentRelevantTurns,
      confirmedMemory,
      memorySuggestions,
      approvedExamples,
      promptContextBlock: [
        activeTask ? `Active Task: ${activeTask.taskType} (expected: ${activeTask.expectedEntityType || 'none'})` : null,
        taskStack.some((t) => t.status === 'PAUSED') ? `Suspended Tasks: ${taskStack.filter((t) => t.status === 'PAUSED').map((t) => t.taskType).join(', ')}` : null,
        summary?.customerGoal ? `Conversation Summary: ${summary.customerGoal}` : null,
        directoryBlock || null,
      ].filter(Boolean).join('\n\n'),
      versions: {
        promptVersion,
        toolSchemaVersion,
        behaviorContractVersion,
        contextCompilerVersion: this.version,
      },
    };
  }

  private async getDurableTurns(
    conversationId: number | null,
    customerId: number,
    limit: number = 6
  ): Promise<Array<{ role: 'user' | 'assistant'; text: string; turnIndex?: number }>> {
    if (!conversationId) return [];
    try {
      const rows = await query<any[]>(
        `SELECT sender_type, text_body, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY id DESC LIMIT ?`,
        [conversationId, limit]
      );
      if (!rows || rows.length === 0) return [];
      return rows
        .reverse()
        .map((r) => ({
          role: r.sender_type === 'CUSTOMER' ? 'user' : 'assistant',
          text: r.text_body || '',
        }));
    } catch {
      return [];
    }
  }
}

export const contextCompilerService = new ContextCompilerService();
