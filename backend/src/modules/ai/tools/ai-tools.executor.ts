import { createHash } from 'crypto';
import { catalogService, SearchResult } from '../../catalog/catalog.service.js';
import { cartService } from '../../carts/cart.service.js';
import { customerService } from '../../customers/customer.service.js';
import { orderService } from '../../orders/order.service.js';
import { orderBatchService } from '../../orders/order-batch.service.js';
import { ToolArgumentSchemas } from '../contract/tool-schemas.js';
import { isMutatingTool, ControlledTool, isToolAllowedAtStage } from '../contract/behavior.contract.js';
import {
  AIConversationState,
  CartSummarySnapshot,
  SelectedAddressSnapshot,
  transitionConversationStage,
} from '../state/ai-state.types.js';
import {
  invalidateCheckout,
  isExplicitCartClearRequest,
  isExplicitConfirmation,
  isHistoricalOrQuestionConfirmation,
  isNegatedConfirmation,
} from '../checkout-safety.js';
import { inferBatchSelection } from '../policy/action-policy.service.js';

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
  stateChanged: boolean;
  cartSummary?: CartSummarySnapshot | null;
  orderCreated?: any;
}

export class AiToolsExecutor {
  private isExplicitConfirmation(phrase: string): boolean {
    return isExplicitConfirmation(phrase);
  }

  private isNegatedConfirmation(phrase: string): boolean {
    return isNegatedConfirmation(phrase);
  }

  private isHistoricalOrQuestionConfirmation(phrase: string): boolean {
    return isHistoricalOrQuestionConfirmation(phrase);
  }

  isExplicitMerchantSwitchApproval(phrase: string, confirmSwitchArg?: boolean): boolean {
    if (confirmSwitchArg !== true) {
      return false;
    }
    const normalized = (phrase || '')
      .toLowerCase()
      .replace(/[“”"'`!?.,،؛:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized || this.isNegatedConfirmation(normalized) || this.isHistoricalOrQuestionConfirmation(normalized)) {
      return false;
    }

    const explicitSwitchPhrases = new Set([
      'switch',
      'switch merchant',
      'yes switch',
      'yes switch merchant',
      'confirm switch',
      'akid badel',
      'akid baddel',
      'baddel',
      'badel',
      'change merchant',
      'yes change',
      'yes change merchant',
      'go ahead switch',
      'clear cart and switch',
      'yalla badel',
      'tamam badel',
      'نعم بدّل',
      'بدّل',
      'غيّر المطعم',
      'نعم غير المطعم',
      'أكيد بدّل',
      'أكيد غير',
      'تمام بدّل',
      'yes',
      'confirm',
      'akid',
      'tamam',
    ]);

    if (explicitSwitchPhrases.has(normalized)) {
      return true;
    }

    return (
      (normalized.includes('switch') ||
        normalized.includes('badel') ||
        normalized.includes('baddel') ||
        normalized.includes('change') ||
        normalized.includes('بدل') ||
        normalized.includes('غير')) &&
      (normalized.includes('yes') ||
        normalized.includes('akid') ||
        normalized.includes('ok') ||
        normalized.includes('confirm') ||
        normalized.includes('yalla') ||
        normalized.includes('نعم') ||
        normalized.includes('تمام'))
    );
  }

  generateCheckoutFingerprint(
    cart: CartSummarySnapshot | null,
    address: SelectedAddressSnapshot | null
  ): string | null {
    if (!cart || cart.itemsCount === 0 || !address) {
      return null;
    }
    const payload = {
      merchant: cart.merchantName,
      items: (cart.items || []).map((i) => ({
        name: i.productName,
        qty: i.quantity,
        price: i.unitPriceUsd,
        variant: i.variant || null,
        notes: i.notes || null,
      })),
      subtotal: cart.subtotalUsd,
      fee: cart.deliveryFeeUsd,
      total: cart.totalUsd,
      addressId: address.id,
      addressLabel: address.label,
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async refreshCartSummary(
    customerId: number,
    shadowMode = false,
    state?: any
  ): Promise<CartSummarySnapshot> {
    if (shadowMode) {
      const readCart = await cartService.getActiveCartReadOnly(customerId);
      if (readCart && readCart.items && readCart.items.length > 0) {
        const items = (readCart.items || []).map((i: any) => ({
          productName: i.product_name || i.name || '',
          merchantName: readCart.merchant_name || '',
          quantity: Number(i.quantity || 1),
          unitPriceUsd: Number(i.unit_price || 0),
          totalPriceUsd: Number(i.line_total || 0),
          variant: i.variant_name || undefined,
          notes: i.customer_notes || undefined,
        }));
        return {
          merchantName: readCart.merchant_name || null,
          itemsCount: items.reduce((acc: number, item: any) => acc + item.quantity, 0),
          items,
          subtotalUsd: Number(readCart.subtotal || 0),
          deliveryFeeUsd: Number(readCart.estimated_delivery_fee || 0),
          totalUsd: Number(readCart.estimated_total || 0),
        };
      }
      if (state?.cartSummary) {
        return state.cartSummary;
      }
      return {
        merchantName: null,
        itemsCount: 0,
        items: [],
        subtotalUsd: 0,
        deliveryFeeUsd: 1.5,
        totalUsd: 1.5,
      };
    }

    const active = await cartService.getOrCreateActiveCart(customerId);
    const items = (active.items || []).map((i: any) => ({
      productName: i.product_name || i.name || '',
      merchantName: active.merchant_name || '',
      quantity: Number(i.quantity || 1),
      unitPriceUsd: Number(i.unit_price || 0),
      totalPriceUsd: Number(i.line_total || 0),
      variant: i.variant_name || undefined,
      notes: i.customer_notes || undefined,
    }));

    return {
      merchantName: active.merchant_name || null,
      itemsCount: items.reduce((acc: number, item: any) => acc + item.quantity, 0),
      items,
      subtotalUsd: Number(active.subtotal || 0),
      deliveryFeeUsd: Number(active.estimated_delivery_fee || 0),
      totalUsd: Number(active.estimated_total || 0),
    };
  }

  private batchResult(batch: import('../../orders/order-batch.service.js').OrderBatchSummary) {
    return {
      batch_id: batch.id,
      payment_policy: 'SEPARATE_CASH',
      status: batch.status,
      children: batch.children.map((child) => ({
        child_index: child.index,
        merchant_name: child.merchantName,
        cart_id: child.cartId,
        address_id: child.addressId,
        status: child.status,
        confirmation_status: child.confirmationStatus,
        subtotal: child.subtotal,
        delivery_fee: child.deliveryFee,
        total: child.total,
        order_number: child.orderNumber || null,
        failure_reason: child.failureReason || null,
      })),
    };
  }

  /**
   * Resolve a merchant mentioned by the customer only from trusted state: the
   * active cart, selected merchant, or a child of the pending batch. Free-form
   * text is never treated as a database lookup key.
   */
  private async resolveMerchantContext(
    customerId: number,
    state: AIConversationState,
    args: { merchant_reference?: string; batch_child_index?: number; scope?: string },
  ): Promise<{ merchantId: number; branchId: number; name: string; batchChildCartId?: number } | null> {
    const activeCart = await cartService.getActiveCartReadOnly(customerId);
    const candidates: { merchantId: number; branchId: number; name: string; batchChildCartId?: number }[] = [];
    if (activeCart?.merchant_branch_id) {
      candidates.push({
        merchantId: 0,
        branchId: Number(activeCart.merchant_branch_id),
        name: String(activeCart.merchant_name || ''),
      });
    }
    if (state.selectedMerchant?.branchId) {
      candidates.push({
        merchantId: state.selectedMerchant.id,
        branchId: state.selectedMerchant.branchId,
        name: state.selectedMerchant.name,
      });
    }

    if (state.pendingOrderBatchId) {
      const batch = await orderBatchService.getBatchSummary(state.pendingOrderBatchId, { refreshQuotes: false });
      for (const child of batch.children) {
        candidates.push({
          merchantId: child.merchantId,
          branchId: child.merchantBranchId,
          name: child.merchantName,
          batchChildCartId: child.cartId,
        });
      }
      if (args.batch_child_index) {
        const child = batch.children[Number(args.batch_child_index) - 1];
        return child
          ? { merchantId: child.merchantId, branchId: child.merchantBranchId, name: child.merchantName, batchChildCartId: child.cartId }
          : null;
      }
    }

    const unique = [...new Map(candidates.filter((candidate) => candidate.branchId > 0).map((candidate) => [candidate.branchId, candidate])).values()];
    const reference = String(args.merchant_reference || '').trim().toLocaleLowerCase();
    if (reference) {
      const matches = unique.filter((candidate) => {
        const name = candidate.name.toLocaleLowerCase();
        return name === reference || name.includes(reference) || reference.includes(name);
      });
      return matches.length === 1 ? matches[0] : null;
    }
    if (args.scope === 'selected_merchant') {
      return state.selectedMerchant?.branchId
        ? { merchantId: state.selectedMerchant.id, branchId: state.selectedMerchant.branchId, name: state.selectedMerchant.name }
        : null;
    }
    // A pending multi-order plan has several merchants; force Gemini to make
    // the reference explicit rather than silently selecting the wrong child.
    if (state.pendingOrderBatchId && unique.length > 1) return null;
    return unique[0] || null;
  }

  /** Preserve legal state history when browsing begins after an order. */
  private transitionToOptionSelection(state: AIConversationState): boolean {
    if (state.stage === 'MULTI_ORDER_REVIEW') return true;
    if (state.stage === 'ORDER_PLACED' || state.stage === 'TRACKING_ORDER') {
      if (!transitionConversationStage(state, 'SEARCHING')) return false;
    }
    return transitionConversationStage(state, 'SELECTING_OPTION');
  }

  /**
   * Execute a single controlled tool against the backend services.
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    customerOrId: number | any,
    state: any,
    mutationCountOrUserMessage: number | string = 0,
    optionsOrUserMessage?: { shadowMode?: boolean } | string,
    optionalUserMessage?: string
  ): Promise<any> {
    const customerId = typeof customerOrId === 'number' ? customerOrId : customerOrId?.id;
    const mutationCountThisTurn = typeof mutationCountOrUserMessage === 'number' ? mutationCountOrUserMessage : 0;
    const userMessage =
      typeof mutationCountOrUserMessage === 'string'
        ? mutationCountOrUserMessage
        : typeof optionsOrUserMessage === 'string'
          ? optionsOrUserMessage
          : optionalUserMessage;
    const options = typeof optionsOrUserMessage === 'object' && optionsOrUserMessage !== null ? optionsOrUserMessage : undefined;

    // Normalize legacy state fields if present
    if (state) {
      if (!state.stage) state.stage = 'IDLE';
      if (state.selectedMerchantId && !state.selectedMerchant) {
        state.selectedMerchant = {
          id: state.selectedMerchantId,
          name: state.selectedMerchantName || '',
          branchId: state.selectedMerchantBranchId || 0,
        };
      }
      if (state.selectedAddressId && !state.selectedAddress) {
        state.selectedAddress = {
          id: state.selectedAddressId,
          label: state.selectedAddressLabel || 'Home',
          formatted: state.selectedAddressLabel || 'Home',
        };
      }
      if (state.awaitingConfirmation === undefined && state.stage === 'AWAITING_CONFIRMATION') {
        state.awaitingConfirmation = true;
      }
    }

    // 1. Validate tool existence
    const schema = (ToolArgumentSchemas as any)[toolName];
    if (!schema) {
      return {
        toolName,
        success: false,
        result: { success: false, error: `Unknown tool: ${toolName}` },
        error: `Unknown tool: ${toolName}`,
        errorCode: 'TOOL_NOT_FOUND',
        stateChanged: false,
      };
    }

    if (!isToolAllowedAtStage(state?.stage || 'IDLE', toolName)) {
      return {
        toolName,
        success: false,
        result: { success: false, error: 'TOOL_NOT_ALLOWED_FOR_PENDING_TASK' },
        error: 'TOOL_NOT_ALLOWED_FOR_PENDING_TASK',
        errorCode: 'TOOL_NOT_ALLOWED_FOR_PENDING_TASK',
        stateChanged: false,
      };
    }

    // 2. Validate arguments with schema
    const effectiveArgs = { ...(args || {}) };
    if (
      (toolName === 'confirm_and_create_order' || toolName === 'switch_merchant_confirm') &&
      !effectiveArgs.confirmation_phrase &&
      userMessage
    ) {
      effectiveArgs.confirmation_phrase = userMessage;
    }
    const parsed = schema.safeParse(effectiveArgs);
    if (!parsed.success) {
      const errMsg = parsed.error.errors.map((e: any) => e.message).join(', ');
      return {
        toolName,
        success: false,
        result: { success: false, error: errMsg },
        error: `Invalid tool arguments for ${toolName}: ${errMsg}`,
        errorCode: 'INVALID_TOOL_ARGUMENTS',
        stateChanged: false,
      };
    }
    const validatedArgs = parsed.data;


    // 3. Prevent multiple conflicting mutations per turn
    if (isMutatingTool(toolName) && mutationCountThisTurn >= 1) {
      return {
        toolName,
        success: false,
        error: `Only one mutation tool call is permitted per conversational turn. Rejected: ${toolName}`,
        errorCode: 'MUTATION_LIMIT_EXCEEDED',
        stateChanged: false,
      };
    }

    // Most tools are read-only and do not need a cart row. Defer this lookup
    // until a cart mutation actually needs it; the old eager query added a DB
    // round trip to every catalog search and address/help turn.
    let cart: any | undefined;
    const ensureCart = async () => {
      if (!cart) {
        cart = options?.shadowMode
          ? (await cartService.getActiveCartReadOnly(customerId)) || ({ id: -1, customer_id: customerId, items: [], status: 'ACTIVE', subtotal: 0, estimated_delivery_fee: 1.5, estimated_total: 1.5 } as any)
          : await cartService.getOrCreateActiveCart(customerId);
      }
      return cart;
    };

    // 4. Dispatch tool
    switch (toolName as any) {
      case 'search_catalog': {
        const query = validatedArgs.query;
        const maxBudget = validatedArgs.max_budget;
        const preference = validatedArgs.preference;

        const results = await catalogService.searchProducts(query, {
          maxBudget,
          preference,
          shadowMode: options?.shadowMode,
        });

        state.lastPresentedOptions = results;
        if (maxBudget) {
          state.activeBudget = { amount: maxBudget, currency: 'USD' };
        }
        this.transitionToOptionSelection(state);

        return {
          toolName,
          success: true,
          result: {
            count: results.length,
            results: results.slice(0, 5).map((r, i) => ({
              option_index: i + 1,
              product_name: r.productName,
              merchant_name: r.merchantName,
              price: `$${Number(r.basePrice).toFixed(2)}`,
              delivery_fee: `$${Number(r.deliveryFee).toFixed(2)}`,
              eta_minutes: r.estimatedMinutes,
            })),
          },
          stateChanged: true,
        };
      }

      case 'resolve_product_name': {
        const branchId = validatedArgs.merchant_branch_id || state.pendingProductMerchantBranchId || state.selectedMerchant?.branchId || null;
        const resolution = await catalogService.resolveProductName(validatedArgs.product_name, {
          merchantBranchId: branchId,
          category: validatedArgs.category || state.pendingProductCategory || null,
          shadowMode: options?.shadowMode,
        });
        state.pendingProductCategory = validatedArgs.category || state.pendingProductCategory || null;
        state.pendingProductMerchantBranchId = branchId;
        state.nextRequiredAction = 'RESOLVE_PRODUCT_NAME';
        state.expectedEntity = 'product_name';
        if (resolution.matched) state.lastPresentedOptions = [resolution.matched];
        return {
          toolName,
          success: true,
          result: {
            stage: resolution.stage,
            requested_name: resolution.requestedName,
            matched_product: resolution.matched ? {
              product_name: resolution.matched.productName,
              merchant_name: resolution.matched.merchantName,
              merchant_product_id: resolution.matched.merchantProductId,
            } : null,
            spelling_candidates: resolution.spellingCandidates,
            verified_alternatives: resolution.verifiedAlternatives.map((item) => ({
              product_name: item.productName,
              merchant_name: item.merchantName,
              price: `$${item.basePrice.toFixed(2)}`,
            })),
          },
          stateChanged: true,
        };
      }

      case 'list_category_options': {
        const merchant = await this.resolveMerchantContext(customerId, state, validatedArgs);
        if (!merchant) {
          return {
            toolName,
            success: false,
            error: 'MERCHANT_REFERENCE_REQUIRED',
            errorCode: 'MERCHANT_REFERENCE_REQUIRED',
            stateChanged: false,
          };
        }
        const categoryOptions = await catalogService.listVerifiedCategoryOptions(merchant.branchId, validatedArgs.category);
        state.pendingProductCategory = validatedArgs.category;
        state.pendingProductMerchantBranchId = merchant.branchId;
        state.lastPresentedOptions = categoryOptions;
        state.nextRequiredAction = 'SELECT_PRODUCT_OPTION';
        state.expectedEntity = 'product_option';
        this.transitionToOptionSelection(state);
        return {
          toolName,
          success: true,
          result: {
            category: validatedArgs.category,
            merchant_name: merchant.name,
            count: categoryOptions.length,
            options: categoryOptions.map((option, index) => ({
              option_index: index + 1,
              product_name: option.productName,
              merchant_name: option.merchantName,
              price: `$${option.basePrice.toFixed(2)}`,
            })),
          },
          stateChanged: true,
        };
      }

      case 'list_merchant_menu': {
        const merchant = await this.resolveMerchantContext(customerId, state, validatedArgs);
        if (!merchant) {
          return { toolName, success: false, error: 'MERCHANT_REFERENCE_REQUIRED', errorCode: 'MERCHANT_REFERENCE_REQUIRED', stateChanged: false };
        }
        const menuOptions = await catalogService.listVerifiedMerchantMenu(merchant.branchId, { category: validatedArgs.category || null });
        state.pendingProductCategory = validatedArgs.category || null;
        state.pendingProductMerchantBranchId = merchant.branchId;
        state.lastPresentedOptions = menuOptions;
        state.nextRequiredAction = 'SELECT_PRODUCT_OPTION';
        state.expectedEntity = 'product_option';
        this.transitionToOptionSelection(state);
        return {
          toolName,
          success: true,
          result: {
            merchant_name: merchant.name,
            category: validatedArgs.category || null,
            count: menuOptions.length,
            options: menuOptions.map((option, index) => ({
              option_index: index + 1,
              product_name: option.productName,
              merchant_name: option.merchantName,
              price: `$${option.basePrice.toFixed(2)}`,
            })),
          },
          stateChanged: true,
        };
      }

      case 'compare_supermarket_basket': {
        const items = validatedArgs.items;
        const comparison = await catalogService.compareSupermarketBasket(items, options?.shadowMode);
        this.transitionToOptionSelection(state);

        return {
          toolName,
          success: true,
          result: comparison,
          stateChanged: true,
        };
      }

      case 'get_active_cart': {
        const summary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = summary;

        return {
          toolName,
          success: true,
          result: summary,
          cartSummary: summary,
          stateChanged: false,
        };
      }

      case 'add_to_cart': {
        // Validate quantity
        if (validatedArgs.quantity !== undefined && (validatedArgs.quantity <= 0 || !Number.isInteger(validatedArgs.quantity))) {
          return {
            toolName,
            success: false,
            error: `Invalid quantity: ${validatedArgs.quantity}. Must be a positive whole integer.`,
            errorCode: 'INVALID_QUANTITY',
            stateChanged: false,
          };
        }

        // Target option resolution
        let targetOption: SearchResult | undefined;
        if (validatedArgs.option_index && state.lastPresentedOptions[validatedArgs.option_index - 1]) {
          targetOption = state.lastPresentedOptions[validatedArgs.option_index - 1];
        } else if (validatedArgs.merchant_product_id) {
          targetOption = state.lastPresentedOptions.find(
            (o: any) => o.merchantProductId === validatedArgs.merchant_product_id
          );
        } else if (validatedArgs.product_name_query) {
          const q = validatedArgs.product_name_query.toLowerCase();
          targetOption = state.lastPresentedOptions.find((o: any) =>
            o.productName.toLowerCase().includes(q)
          );
          if (!targetOption) {
            const fresh = await catalogService.searchProducts(validatedArgs.product_name_query, {
              shadowMode: options?.shadowMode,
            });
            if (fresh.length > 0) targetOption = fresh[0];
          }
        }

        if (!targetOption) {
          return {
            toolName,
            success: false,
            error: `Product not found in current options or catalog. Please search first.`,
            errorCode: 'PRODUCT_NOT_FOUND',
            stateChanged: false,
          };
        }

        // A pending batch owns its own child carts. Adding an option from one
        // of those merchants extends that exact child, rather than treating it
        // as an unsafe merchant switch on the customer's ordinary cart.
        if (state.pendingOrderBatchId) {
          const batch = await orderBatchService.getBatchSummary(state.pendingOrderBatchId, { refreshQuotes: false });
          const batchChild = batch.children.find((child) => child.merchantBranchId === targetOption!.merchantBranchId);
          if (batchChild) {
            if (batchChild.status !== 'REVIEW') {
              return {
                toolName,
                success: false,
                error: 'BATCH_CHILD_NOT_EDITABLE',
                errorCode: 'BATCH_CHILD_NOT_EDITABLE',
                stateChanged: false,
              };
            }
            if (!options?.shadowMode) {
              await cartService.addItem(
                batchChild.cartId,
                targetOption.merchantProductId,
                validatedArgs.quantity || 1,
                validatedArgs.customer_notes,
                validatedArgs.variant_name,
              );
            }
            state.selectedMerchant = {
              id: targetOption.merchantId,
              name: targetOption.merchantName,
              branchId: targetOption.merchantBranchId,
            };
            invalidateCheckout(state);
            state.nextRequiredAction = batch.children.every((child) => child.addressId) ? 'CONFIRM_ORDER_BATCH' : 'SELECT_BATCH_ADDRESS';
            state.expectedEntity = batch.children.every((child) => child.addressId) ? 'confirm_both_or_child' : 'delivery_address';
            const refreshedBatch = await orderBatchService.getBatchSummary(state.pendingOrderBatchId, { refreshQuotes: !options?.shadowMode });
            return {
              toolName,
              success: true,
              result: {
                success: true,
                action: 'ADDED_TO_ORDER_BATCH',
                product: targetOption.productName,
                quantity: validatedArgs.quantity || 1,
                batch: this.batchResult(refreshedBatch),
                shadowExecution: options?.shadowMode || false,
              },
              stateChanged: true,
            };
          }
        }

        // Cross-merchant guard
        const currentCart = options?.shadowMode
          ? await cartService.getActiveCartReadOnly(customerId)
          : await cartService.getOrCreateActiveCart(customerId);
        if (
          currentCart &&
          currentCart.merchant_branch_id &&
          currentCart.items &&
          currentCart.items.length > 0 &&
          currentCart.merchant_branch_id !== targetOption.merchantBranchId
        ) {
          state.pendingMerchantSwitch = {
            newMerchantId: targetOption.merchantId,
            newMerchantName: targetOption.merchantName,
            newBranchId: targetOption.merchantBranchId,
            proposedAtTurn: state.turnIndex ?? 1,
            pendingProduct: {
              merchantProductId: targetOption.merchantProductId,
              productNameQuery: targetOption.productName,
              quantity: validatedArgs.quantity || 1,
              notes: validatedArgs.customer_notes,
              variantName: validatedArgs.variant_name,
            },
          };
          state.nextRequiredAction = 'CONFIRM_MERCHANT_SWITCH';
          state.expectedEntity = targetOption.merchantName;
          transitionConversationStage(state, 'AWAITING_MERCHANT_SWITCH');

          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: 'CART_MERCHANT_SWITCH_CONFIRMATION_REQUIRED',
            },
            error: 'CART_MERCHANT_SWITCH_CONFIRMATION_REQUIRED',
            errorCode: 'CART_MERCHANT_SWITCH_CONFIRMATION_REQUIRED',
            stateChanged: true,
          };
        }

        if (!options?.shadowMode) {
          await cartService.addItem(
            currentCart?.id || (await ensureCart()).id,
            targetOption.merchantProductId,
            validatedArgs.quantity || 1,
            validatedArgs.customer_notes,
            validatedArgs.variant_name
          );
        }

        state.selectedMerchant = {
          id: targetOption.merchantId,
          name: targetOption.merchantName,
          branchId: targetOption.merchantBranchId,
        };

        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        invalidateCheckout(state);
        state.activeOrderSummary = null;
        transitionConversationStage(state, 'EDITING_CART');

        return {
          toolName,
          success: true,
          result: {
            success: true,
            action: 'ADDED',
            product: targetOption.productName,
            quantity: validatedArgs.quantity || 1,
            variant: validatedArgs.variant_name || null,
            cart: updatedSummary,
            shadowExecution: options?.shadowMode || false,
          },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'update_cart_quantity': {
        const target = validatedArgs.target_item;
        const newQty = validatedArgs.new_quantity;

        if (options?.shadowMode) {
          const updatedSummary = await this.refreshCartSummary(customerId, true, state);
          invalidateCheckout(state);
          return {
            toolName,
            success: true,
            result: { action: 'QUANTITY_UPDATED', item: target, new_quantity: newQty, cart: updatedSummary, shadowExecution: true },
            stateChanged: true,
          };
        }

        const activeCart = await ensureCart();
        const updated = await cartService.updateItemQuantity(activeCart.id, target, newQty);
        if (updated.ambiguous) {
          state.pendingClarification = {
            type: 'QUANTITY_TARGET',
            candidates: (updated.candidates || []).map((c: any) => c.product_name),
            originalAction: 'update_cart_quantity',
            originalValue: String(newQty),
          };
          transitionConversationStage(state, 'AWAITING_CLARIFICATION');
          return {
            toolName,
            success: false,
            error: `Clarification required: Multiple items match "${target}" in your cart (${(updated.candidates || []).map((c: any) => c.product_name).join(', ')}). Which one did you mean?`,
            errorCode: 'AMBIGUOUS_CART_ITEM',
            stateChanged: true,
          };
        }

        if (!updated.success) {
          return {
            toolName,
            success: false,
            error: `Item "${target}" not found in active cart.`,
            errorCode: 'CART_ITEM_NOT_FOUND',
            stateChanged: false,
          };
        }

        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        invalidateCheckout(state);
        transitionConversationStage(state, 'EDITING_CART');

        return {
          toolName,
          success: true,
          result: {
            action: newQty === 0 ? 'REMOVED' : 'QUANTITY_UPDATED',
            item: target,
            new_quantity: newQty,
            cart: updatedSummary,
          },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'update_cart_variant': {
        const target = validatedArgs.target_item;
        const variant = validatedArgs.variant_name;

        if (options?.shadowMode) {
          const updatedSummary = await this.refreshCartSummary(customerId, true, state);
          invalidateCheckout(state);
          return {
            toolName,
            success: true,
            result: { action: 'VARIANT_UPDATED', item: target, new_variant: variant, cart: updatedSummary, shadowExecution: true },
            stateChanged: true,
          };
        }

        const activeCart = await ensureCart();
        const updateRes = await cartService.updateItemVariant(activeCart.id, target, variant);
        if (updateRes.ambiguous) {
          state.pendingClarification = {
            type: 'VARIANT_OPTION',
            candidates: (updateRes.candidates || []).map((c: any) => c.product_name),
            originalAction: 'update_cart_variant',
            originalValue: variant,
          };
          transitionConversationStage(state, 'AWAITING_CLARIFICATION');
          return {
            toolName,
            success: false,
            error: `Clarification required: Multiple items in your cart could be modified (${(updateRes.candidates || []).map((c: any) => c.product_name).join(', ')}). Which one did you mean?`,
            errorCode: 'AMBIGUOUS_CART_ITEM',
            stateChanged: true,
          };
        }

        if (!updateRes.success) {
          return {
            toolName,
            success: false,
            error: updateRes.error || `Could not update variant for "${target}". Check variant availability.`,
            errorCode: 'VARIANT_UPDATE_FAILED',
            stateChanged: false,
          };
        }

        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        state.pendingClarification = null;
        invalidateCheckout(state);
        transitionConversationStage(state, 'EDITING_CART');

        return {
          toolName,
          success: true,
          result: {
            action: 'VARIANT_UPDATED',
            item: target,
            new_variant: variant,
            new_price: updateRes.newPrice,
            cart: updatedSummary,
          },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'update_cart_notes': {
        const target = validatedArgs.target_item;
        const notes = validatedArgs.notes;

        if (!options?.shadowMode) {
          const activeCart = await ensureCart();
          const ok = await cartService.updateItemNotes(activeCart.id, target, notes);
          if (!ok) {
            return {
              toolName,
              success: false,
              error: `Item "${target}" not found in active cart.`,
              errorCode: 'CART_ITEM_NOT_FOUND',
              stateChanged: false,
            };
          }
        }
        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        invalidateCheckout(state);

        return {
          toolName,
          success: true,
          result: { action: 'NOTES_UPDATED', item: target, notes },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'remove_cart_item': {
        const target = validatedArgs.target_item;

        if (!options?.shadowMode) {
          const activeCart = await ensureCart();
          const ok = await cartService.removeItem(activeCart.id, target);
          if (!ok) {
            return {
              toolName,
              success: false,
              error: `Item "${target}" not found in active cart.`,
              errorCode: 'CART_ITEM_NOT_FOUND',
              stateChanged: false,
            };
          }
        }
        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        invalidateCheckout(state);

        return {
          toolName,
          success: true,
          result: { action: 'ITEM_REMOVED', item: target, cart: updatedSummary },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'clear_cart': {
        if (validatedArgs.confirmation !== true) {
          return {
            toolName,
            success: false,
            result: { success: false, error: 'EXPLICIT_CART_CLEAR_CONFIRMATION_REQUIRED' },
            error: 'EXPLICIT_CART_CLEAR_CONFIRMATION_REQUIRED',
            errorCode: 'EXPLICIT_CART_CLEAR_CONFIRMATION_REQUIRED',
            stateChanged: false,
          };
        }
        const msg = (userMessage || '').toLowerCase().trim();
        const isExplicitClear = isExplicitCartClearRequest(msg) || msg.includes('clear cart') || msg.includes('empty cart');

        if (userMessage && !isExplicitClear) {
          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: 'EXPLICIT_CART_CLEAR_REQUIRED',
            },
            error: 'EXPLICIT_CART_CLEAR_REQUIRED',
            errorCode: 'EXPLICIT_CART_CLEAR_REQUIRED',
            stateChanged: false,
          };
        }

        if (!options?.shadowMode) {
          const activeCart = await ensureCart();
          await cartService.clearCart(activeCart.id);
        }
        state.cartSummary = null;
        state.selectedMerchant = null;
        invalidateCheckout(state);
        state.activeOrderSummary = null;
        state.pendingMerchantSwitch = null;
        state.nextRequiredAction = null;
        state.expectedEntity = null;
        transitionConversationStage(state, 'IDLE');

        return {
          toolName,
          success: true,
          result: { success: true, action: 'CART_CLEARED' },
          cartSummary: null,
          stateChanged: true,
        };
      }

      case 'list_saved_addresses':
      case 'get_customer_addresses': {
        const addresses = await customerService.getCustomerAddresses(customerId);

        return {
          toolName,
          success: true,
          result: {
            addresses: addresses.map((a: any) => ({
              label: a.label,
              formatted_address: a.formatted_address || a.formattedAddress,
              area: a.area_name || a.areaName,
              is_default: Boolean(a.is_default),
            })),
          },
          stateChanged: false,
        };
      }

      case 'select_delivery_address': {
        const label = validatedArgs.address_label;
        const matched = await customerService.resolveAddressByPhrase(customerId, label);

        if (!matched) {
          const allAddresses = await customerService.getCustomerAddresses(customerId);
          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: `Address "${label}" not found. Available addresses: ${allAddresses.map((a: any) => a.label).join(', ')}`,
            },
            error: `Address "${label}" not found. Available addresses: ${allAddresses.map((a: any) => a.label).join(', ')}`,
            errorCode: 'ADDRESS_NOT_FOUND',
            stateChanged: false,
          };
        }

        state.selectedAddress = {
          id: matched.id,
          label: matched.label,
          formatted: matched.formatted_address || matched.label,
          area: matched.area_name || undefined,
        };
        state.pendingMerchantSwitch = null;
        state.awaitingConfirmation = true;
        transitionConversationStage(state, 'AWAITING_CONFIRMATION');

        const summary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = summary;
        state.checkoutFingerprint = this.generateCheckoutFingerprint(summary, state.selectedAddress);

        return {
          toolName,
          success: true,
          result: {
            selected_address: matched.label,
            formatted: matched.formatted_address || matched.label,
            checkout_preview: summary,
            ready_for_confirmation: true,
            checkout_fingerprint: state.checkoutFingerprint,
          },
          cartSummary: summary,
          stateChanged: true,
        };
      }

      case 'capture_delivery_address': {
        const conversationId = Number(state.conversationId || 0);
        if (!conversationId) {
          return { toolName, success: false, error: 'CONVERSATION_ID_REQUIRED_FOR_ADDRESS_DRAFT', errorCode: 'ADDRESS_VALIDATION_FAILED', stateChanged: false };
        }
        const draft = await customerService.captureDeliveryAddressDraft(
          customerId,
          conversationId,
          validatedArgs.raw_address,
          state.lastProcessedMessageId || null,
          validatedArgs.save_label || null,
        );
        state.addressDraft = {
          id: draft.draftId,
          status: draft.status,
          area: draft.area || null,
          summary: draft.safeSummary,
          saveConsent: validatedArgs.save_label ? 'accepted' : 'pending',
        };
        state.nextRequiredAction = draft.status === 'serviceable' ? 'CONFIRM_DELIVERY_ADDRESS_DRAFT' : 'PROVIDE_ADDRESS_DETAIL';
        state.expectedEntity = draft.status === 'serviceable' ? 'address_confirmation' : 'location_or_landmark';
        if (draft.status !== 'serviceable' || !draft.address) {
          transitionConversationStage(state, 'ADDRESS_DRAFT_REVIEW');
          return {
            toolName,
            success: false,
            result: { success: false, address_status: draft.status, safe_summary: draft.safeSummary },
            error: 'ADDRESS_VALIDATION_FAILED',
            errorCode: draft.status === 'unserviceable' ? 'ADDRESS_UNSERVICEABLE' : 'ADDRESS_UNVALIDATED',
            stateChanged: true,
          };
        }
        state.selectedAddress = {
          id: draft.address.id,
          label: draft.address.label,
          formatted: draft.address.formatted_address || draft.address.label,
          area: draft.address.area_name || undefined,
        };
        state.awaitingConfirmation = true;
        transitionConversationStage(state, 'AWAITING_CONFIRMATION');
        const summary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = summary;
        state.checkoutFingerprint = this.generateCheckoutFingerprint(summary, state.selectedAddress);
        state.nextRequiredAction = 'CONFIRM_ORDER';
        state.expectedEntity = 'explicit_confirmation';
        return {
          toolName,
          success: true,
          result: {
            address_status: 'serviceable',
            address_summary: draft.safeSummary,
            checkout_preview: summary,
            ready_for_confirmation: true,
          },
          cartSummary: summary,
          stateChanged: true,
        };
      }

      case 'rename_delivery_address': {
        if (!state.selectedAddress?.id) {
          return {
            toolName,
            success: false,
            error: 'No selected delivery address to rename.',
            errorCode: 'ADDRESS_NOT_FOUND',
            stateChanged: false,
          };
        }
        const renamed = await customerService.renameCustomerAddress(
          customerId,
          state.selectedAddress.id,
          validatedArgs.address_label,
        );
        state.selectedAddress = {
          id: renamed.id,
          label: renamed.label,
          formatted: renamed.formatted_address || renamed.label,
          area: renamed.area_name || undefined,
        };
        if (state.addressDraft) state.addressDraft.saveConsent = 'accepted';
        // The address label is part of the checkout fingerprint shown to the
        // customer, so force a fresh review after a rename.
        state.checkoutFingerprint = this.generateCheckoutFingerprint(state.cartSummary, state.selectedAddress);
        state.awaitingConfirmation = Boolean(state.checkoutFingerprint);
        state.nextRequiredAction = state.pendingOrderBatchId ? 'CONFIRM_ORDER_BATCH' : 'CONFIRM_ORDER';
        state.expectedEntity = state.pendingOrderBatchId ? 'confirm_both_or_child' : 'explicit_confirmation';
        return {
          toolName,
          success: true,
          result: {
            address_label: renamed.label,
            formatted: renamed.formatted_address || renamed.label,
            action: 'ADDRESS_RENAMED',
          },
          stateChanged: true,
        };
      }

      case 'confirm_and_create_order': {
        const phrase = (userMessage || validatedArgs.confirmation_phrase || '').trim();

        // 1. Strict Server-Side Order Confirmation Checks
        if (
          !phrase ||
          this.isNegatedConfirmation(phrase) ||
          this.isHistoricalOrQuestionConfirmation(phrase) ||
          !this.isExplicitConfirmation(phrase)
        ) {
          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: 'EXPLICIT_CONFIRMATION_REQUIRED',
            },
            error: 'EXPLICIT_CONFIRMATION_REQUIRED',
            errorCode: 'EXPLICIT_CONFIRMATION_REQUIRED',
            stateChanged: false,
          };
        }

        // 2. Resolve an already-placed order before requiring checkout-stage
        // prerequisites. Repeating confirmation after order placement is safe
        // and must return the existing order without re-creating it.
        if (
          state.activeOrderSummary &&
          (state.stage === 'ORDER_PLACED' || state.stage === 'TRACKING_ORDER') &&
          !state.pendingMerchantSwitch &&
          !state.pendingClarification
        ) {
          return {
            toolName,
            success: true,
            result: {
              action: 'IDEMPOTENT_CONFIRMATION',
              order_id: state.activeOrderSummary.orderId,
              order_number: state.activeOrderSummary.orderNumber,
              status: state.activeOrderSummary.status,
              total: `$${Number(state.activeOrderSummary.totalUsd).toFixed(2)}`,
              message: 'Order was already created for this checkout.',
            },
            stateChanged: false,
          };
        }

        // 3. Stage and Address Requirement Checks
        if (
          state.stage !== 'AWAITING_CONFIRMATION' ||
          !state.awaitingConfirmation ||
          !state.selectedAddress ||
          state.pendingMerchantSwitch ||
          state.pendingClarification
        ) {
          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: 'FINAL_SUMMARY_CONFIRMATION_REQUIRED',
            },
            error: 'FINAL_SUMMARY_CONFIRMATION_REQUIRED',
            errorCode: 'FINAL_SUMMARY_CONFIRMATION_REQUIRED',
            stateChanged: false,
          };
        }

        // Idempotency during the active checkout stage is also safe. A pending
        // merchant switch can never return an old order as successful.
        if (state.activeOrderSummary) {
          return {
            toolName,
            success: true,
            result: {
              action: 'IDEMPOTENT_CONFIRMATION',
              order_id: state.activeOrderSummary.orderId,
              order_number: state.activeOrderSummary.orderNumber,
              status: state.activeOrderSummary.status,
              total: `$${Number(state.activeOrderSummary.totalUsd).toFixed(2)}`,
              message: 'Order was already created for this checkout.',
            },
            stateChanged: false,
          };
        }

        const summary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        if (summary.itemsCount === 0) {
          return {
            toolName,
            success: false,
            error: `Order creation rejected: Cart is empty.`,
            errorCode: 'CART_EMPTY',
            stateChanged: false,
          };
        }

        // 4. Server-Enforced Checkout Revision Fingerprint Check (Audit Finding Area C)
        const currentFingerprint = this.generateCheckoutFingerprint(summary, state.selectedAddress);
        if (!state.checkoutFingerprint || currentFingerprint !== state.checkoutFingerprint) {
          invalidateCheckout(state);
          return {
            toolName,
            success: false,
            result: {
              success: false,
              error: 'CHECKOUT_REVISION_MISMATCH',
              message: 'Cart or checkout state was modified since final order summary was presented. A fresh summary must be presented and confirmed.',
            },
            error: 'CHECKOUT_REVISION_MISMATCH: Checkout state modified since final summary was shown',
            errorCode: 'CHECKOUT_REVISION_MISMATCH',
            stateChanged: false,
          };
        }



        // 4. Idempotency Check: Repeated confirmation returns idempotent order without re-creation
        if (state.activeOrderSummary) {
          return {
            toolName,
            success: true,
            result: {
              action: 'IDEMPOTENT_CONFIRMATION',
              order_id: state.activeOrderSummary.orderId,
              order_number: state.activeOrderSummary.orderNumber,
              status: state.activeOrderSummary.status,
              total: `$${Number(state.activeOrderSummary.totalUsd).toFixed(2)}`,
              message: 'Order was already created for this checkout.',
            },
            stateChanged: false,
          };
        }

        if (options?.shadowMode) {
          return {
            toolName,
            success: true,
            result: {
              action: 'ORDER_CONFIRMED',
              shadowExecution: true,
              simulated_order_number: 'LION-SHADOW-0001',
              total: `$${Number(summary.totalUsd).toFixed(2)}`,
              delivery_address: state.selectedAddress.label,
            },
            stateChanged: true,
          };
        }

        const order = await orderService.createOrderFromCart(
          customerId,
          state.selectedAddress.id,
          validatedArgs.notes || null
        );

        state.activeOrderSummary = {
          orderId: order.id,
          orderNumber: order.order_number,
          merchantName: summary.merchantName || 'Lion Merchant',
          status: order.status,
          totalUsd: order.grand_total,
          createdAt: new Date().toISOString(),
        };
        state.cartSummary = null;
        transitionConversationStage(state, 'ORDER_PLACED');
        invalidateCheckout(state);

        return {
          toolName,
          success: true,
          result: {
            order_id: order.id,
            order_number: order.order_number,
            status: order.status,
            total: `$${Number(order.grand_total).toFixed(2)}`,
            delivery_address: state.selectedAddress.label,
          },
          orderCreated: order,
          stateChanged: true,
        };
      }

      case 'switch_merchant_confirm': {
        if (!state.pendingMerchantSwitch) {
          return {
            toolName,
            success: false,
            error: 'No pending merchant switch to confirm.',
            errorCode: 'NO_PENDING_SWITCH',
            stateChanged: false,
          };
        }

        // Turn isolation: Disallow same-turn chaining (Audit Finding Area D)
        const currentTurn = state.turnIndex ?? 1;
        if (
          state.pendingMerchantSwitch.proposedAtTurn !== undefined &&
          state.pendingMerchantSwitch.proposedAtTurn === currentTurn
        ) {
          return {
            toolName,
            success: false,
            error: 'Merchant switch cannot be confirmed in the same turn it was proposed. Present switch confirmation prompt to customer first.',
            errorCode: 'SAME_TURN_SWITCH_FORBIDDEN',
            stateChanged: false,
          };
        }

        // Validate explicit customer approval from current user message
        const approvalPhrase = (userMessage || '').trim();
        const isApproved = this.isExplicitMerchantSwitchApproval(approvalPhrase, validatedArgs.confirm_switch);

        if (!isApproved) {
          // If rejected, negated, or vague: preserve old cart and clear pending switch
          state.pendingMerchantSwitch = null;
          return {
            toolName,
            success: false,
            result: {
              success: false,
              action: 'MERCHANT_SWITCH_REJECTED',
              message: 'Merchant switch was not approved. Existing cart was preserved.',
            },
            error: 'EXPLICIT_MERCHANT_SWITCH_APPROVAL_REQUIRED',
            errorCode: 'EXPLICIT_MERCHANT_SWITCH_APPROVAL_REQUIRED',
            stateChanged: false,
          };
        }

        const pending = state.pendingMerchantSwitch;
        state.pendingMerchantSwitch = null;
        state.nextRequiredAction = null;
        state.expectedEntity = null;

        if (!options?.shadowMode) {
          const currentCart = await cartService.getOrCreateActiveCart(customerId);
          await cartService.clearCart(currentCart.id);
          if (pending.pendingProduct.merchantProductId) {
            await cartService.addItem(
              currentCart.id,
              pending.pendingProduct.merchantProductId,
              pending.pendingProduct.quantity || 1,
              pending.pendingProduct.notes,
              pending.pendingProduct.variantName
            );
          }
        }

        state.selectedMerchant = {
          id: pending.newMerchantId,
          name: pending.newMerchantName,
          branchId: pending.newBranchId || 0,
        };

        const updatedSummary = await this.refreshCartSummary(customerId, options?.shadowMode, state);
        state.cartSummary = updatedSummary;
        invalidateCheckout(state);
        state.activeOrderSummary = null;
        transitionConversationStage(state, 'EDITING_CART');

        return {
          toolName,
          success: true,
          result: {
            action: 'MERCHANT_SWITCHED',
            new_merchant: pending.newMerchantName,
            cart: updatedSummary,
            shadowExecution: options?.shadowMode || false,
          },
          cartSummary: updatedSummary,
          stateChanged: true,
        };
      }

      case 'switch_merchant_reject': {
        state.pendingMerchantSwitch = null;
        state.nextRequiredAction = null;
        state.expectedEntity = null;
        transitionConversationStage(state, 'EDITING_CART');
        return {
          toolName,
          success: true,
          result: {
            action: 'MERCHANT_SWITCH_REJECTED',
            message: 'Merchant switch cancelled. Existing cart items preserved.',
          },
          stateChanged: true,
        };
      }

      case 'create_multi_order_plan': {
        const active = await cartService.getActiveCartReadOnly(customerId);
        let selections = (validatedArgs.items || []).map((item: any) => ({
          merchantProductId: item.merchant_product_id,
          quantity: item.quantity || 1,
        }));
        if (validatedArgs.selection_source === 'last_presented_options') {
          const indexes: number[] = [...new Set<number>((validatedArgs.selected_option_indexes || []).map((value: any) => Number(value)))];
          const resolved = indexes.map((index) => state.lastPresentedOptions[index - 1]).filter(Boolean);
          if (resolved.length !== indexes.length || resolved.length < 2) {
            return {
              toolName,
              success: false,
              error: 'PRESENTED_OPTION_SELECTION_INVALID',
              errorCode: 'PRESENTED_OPTION_SELECTION_INVALID',
              stateChanged: false,
            };
          }
          selections = resolved.map((option) => ({ merchantProductId: option.merchantProductId, quantity: 1 }));
        }
        if (!active?.items?.length && selections.length < 2) {
          return {
            toolName,
            success: false,
            error: 'MULTI_ORDER_SELECTION_REQUIRED',
            errorCode: 'MULTI_ORDER_SELECTION_REQUIRED',
            stateChanged: false,
          };
        }
        const batchSelectionKey = selections
          .map((item: any) => `${item.merchantProductId}:${item.quantity}`)
          .sort()
          .join('|');
        const batch = await orderBatchService.createOrExtendBatch({
          customerId,
          conversationId: state.conversationId || null,
          sourceCartId: active?.id || null,
          additionalItems: selections,
          // Stable within the active cart/plan so duplicate webhook delivery
          // cannot create a second batch, while a new cart can intentionally
          // start a fresh plan later.
          idempotencyKey: `conversation_batch:${state.conversationId || customerId}:${active?.id || 0}:${batchSelectionKey}`,
        });
        state.pendingOrderBatchId = batch.id;
        state.nextRequiredAction = batch.children.every((child) => child.addressId) ? 'CONFIRM_ORDER_BATCH' : 'SELECT_BATCH_ADDRESS';
        state.expectedEntity = batch.children.every((child) => child.addressId) ? 'confirm_both_or_child' : 'delivery_address';
        transitionConversationStage(state, 'MULTI_ORDER_REVIEW');
        return { toolName, success: true, result: this.batchResult(batch), stateChanged: true };
      }

      case 'review_multi_order_plan': {
        if (!state.pendingOrderBatchId) return { toolName, success: false, error: 'NO_PENDING_ORDER_BATCH', errorCode: 'NO_PENDING_ORDER_BATCH', stateChanged: false };
        const batch = await orderBatchService.getBatchSummary(state.pendingOrderBatchId);
        return { toolName, success: true, result: this.batchResult(batch), stateChanged: false };
      }

      case 'set_batch_delivery_address': {
        if (!state.pendingOrderBatchId) return { toolName, success: false, error: 'NO_PENDING_ORDER_BATCH', errorCode: 'NO_PENDING_ORDER_BATCH', stateChanged: false };
        const matched = await customerService.resolveAddressByPhrase(customerId, validatedArgs.address_label);
        if (!matched) return { toolName, success: false, error: 'ADDRESS_NOT_FOUND', errorCode: 'ADDRESS_NOT_FOUND', stateChanged: false };
        const batch = await orderBatchService.setSharedAddress(state.pendingOrderBatchId, customerId, matched.id);
        state.nextRequiredAction = 'CONFIRM_ORDER_BATCH';
        state.expectedEntity = 'confirm_both_or_child';
        transitionConversationStage(state, 'MULTI_ORDER_REVIEW');
        return { toolName, success: true, result: this.batchResult(batch), stateChanged: true };
      }

      case 'cancel_order_batch_child': {
        if (!state.pendingOrderBatchId) return { toolName, success: false, error: 'NO_PENDING_ORDER_BATCH', errorCode: 'NO_PENDING_ORDER_BATCH', stateChanged: false };
        const batch = await orderBatchService.cancelChild(state.pendingOrderBatchId, validatedArgs.child_index);
        return { toolName, success: true, result: this.batchResult(batch), stateChanged: true };
      }

      case 'confirm_order_batch': {
        if (!state.pendingOrderBatchId) return { toolName, success: false, error: 'NO_PENDING_ORDER_BATCH', errorCode: 'NO_PENDING_ORDER_BATCH', stateChanged: false };
        const phrase = String(userMessage || validatedArgs.confirmation_phrase || '').trim().toLowerCase();
        const inferredSelection = validatedArgs.selection || inferBatchSelection(phrase);
        if (!inferredSelection || !['1', '2', 'both'].includes(inferredSelection) || !this.isExplicitConfirmation(phrase.replace('both', '').replace(/\b[12]\b/g, '').trim() || 'confirm')) {
          return { toolName, success: false, error: 'EXPLICIT_BATCH_CONFIRMATION_REQUIRED', errorCode: 'EXPLICIT_CONFIRMATION_REQUIRED', stateChanged: false };
        }
        const batch = await orderBatchService.confirm(state.pendingOrderBatchId, customerId, inferredSelection as '1' | '2' | 'both', state.conversationId || null);
        if (batch.status === 'PLACED') {
          state.nextRequiredAction = null;
          state.expectedEntity = null;
          transitionConversationStage(state, 'ORDER_PLACED');
        }
        return { toolName, success: true, result: this.batchResult(batch), stateChanged: true };
      }

      case 'get_order_status': {
        const activeOrder = await orderService.getCustomerActiveOrder(customerId);

        if (!activeOrder) {
          return {
            toolName,
            success: false,
            error: `No active or past order found for this customer.`,
            errorCode: 'NO_ORDER_FOUND',
            stateChanged: false,
          };
        }

        transitionConversationStage(state, 'TRACKING_ORDER');

        return {
          toolName,
          success: true,
          result: {
            has_active_order: true,
            order_number: activeOrder.order_number,
            status: activeOrder.status,
            merchant_name: activeOrder.merchant_name,
            driver_name: activeOrder.driver_name || null,
            driver_code: activeOrder.driver_code || null,
            grand_total: activeOrder.grand_total,
          },
          stateChanged: true,
        };
      }

      case 'request_human_support': {
        transitionConversationStage(state, 'HUMAN_SUPPORT');
        return {
          toolName,
          success: true,
          result: {
            action: 'HANDOFF_TO_HUMAN',
            reason: validatedArgs.reason,
            operator_notified: true,
          },
          stateChanged: true,
        };
      }

      default:
        return {
          toolName,
          success: false,
          error: `Tool implementation missing: ${toolName}`,
          errorCode: 'NOT_IMPLEMENTED',
          stateChanged: false,
        };
    }
  }
}

export const aiToolsExecutor = new AiToolsExecutor();
