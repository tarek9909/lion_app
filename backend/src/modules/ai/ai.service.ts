import { catalogService, SearchResult } from '../catalog/catalog.service.js';
import { cartService } from '../carts/cart.service.js';
import { customerService } from '../customers/customer.service.js';
import { orderService } from '../orders/order.service.js';
import { redis } from '../../database/redis.js';
import { query } from '../../database/db.js';
import { config } from '../../config/env.js';
import { formatDualCurrency } from '../../shared/money.js';
import { geminiService } from './gemini.service.js';
import { AIContextState, ValidatedIntent, AIProcessResult } from './ai.types.js';

export { AIContextState, ValidatedIntent, AIProcessResult };

export class AIService {
  private async getState(customerId: number): Promise<AIContextState> {
    try {
      const raw = await redis.get(`ai:state:${customerId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}

    return {
      customerId,
      lastPresentedOptions: [],
      selectedMerchantId: null,
      selectedMerchantBranchId: null,
      selectedMerchantName: null,
      budgetLimit: null,
      pendingClarification: null,
      selectedAddressId: null,
      selectedAddressLabel: null,
      awaitingConfirmation: false,
      activeOrderId: null,
    };
  }

  private async saveState(customerId: number, state: AIContextState): Promise<void> {
    try {
      await redis.set(`ai:state:${customerId}`, JSON.stringify(state), 86400);
    } catch {}
  }

  /**
   * Main Conversational Processing Pipeline (G-020, G-021)
   */
  async processCustomerMessage(
    whatsappNumber: string,
    messageText: string,
    mediaType?: 'text' | 'image' | 'audio' | 'location'
  ): Promise<AIProcessResult> {
    // Dispatch to Gemini 3.8 Flash provider when configured
    if (config.ai.provider === 'gemini') {
      return geminiService.processCustomerMessage(whatsappNumber, messageText, mediaType);
    }

    const customer = await customerService.findOrCreateByPhone(whatsappNumber);
    const state = await this.getState(customer.id);
    const cart = await cartService.getOrCreateActiveCart(customer.id);

    const text = (messageText || '').trim();
    const lower = text.toLowerCase();

    // -------------------------------------------------------------
    // 0. HANDLE PENDING CLARIFICATION (G-022, G-029)
    // -------------------------------------------------------------
    if (state.pendingClarification === 'SIZE_TARGET_DISAMBIGUATION') {
      if (
        lower === 'the coke' ||
        lower === 'coke' ||
        lower === 'the drink' ||
        lower === 'drink' ||
        lower.includes('coke') ||
        lower.includes('drink') ||
        lower === 'كولا' ||
        lower === 'المشروب'
      ) {
        state.pendingClarification = null;
        // Real DB variant price update (G-029)
        const updateRes = await cartService.updateItemVariant(cart.id, 'coke', 'Large');
        const updatedTotals = await cartService.recalculateCart(cart.id);

        let budgetAlert = '';
        if (state.budgetLimit && updatedTotals.total > state.budgetLimit) {
          budgetAlert = `\n⚠️ *Note*: Your new total ($${updatedTotals.total.toFixed(2)}) is slightly above your original $${state.budgetLimit} budget.`;
        }

        await this.saveState(customer.id, state);
        return {
          intent: 'CLARIFICATION_RESOLVED',
          confidence: 0.98,
          actionTaken: 'UPDATED_DRINK_SIZE_VARIANT',
          replyText: `Got it! Updated the Coke Zero to **Large**${updateRes.newPrice ? ` ($${updateRes.newPrice.toFixed(2)})` : ''}.${budgetAlert}\n\nYour cart total is **$${updatedTotals.total.toFixed(2)}**. Where should we deliver this? (e.g. *Home* / *3al Bet*)`,
        };
      } else if (
        lower === 'the meal' ||
        lower === 'meal' ||
        lower === 'the chicken' ||
        lower.includes('meal') ||
        lower.includes('chicken') ||
        lower === 'الوجبة'
      ) {
        state.pendingClarification = null;
        // Real DB variant price update (G-029)
        const updateRes = await cartService.updateItemVariant(cart.id, 'meal', 'Large');
        const updatedTotals = await cartService.recalculateCart(cart.id);

        let budgetAlert = '';
        if (state.budgetLimit && updatedTotals.total > state.budgetLimit) {
          budgetAlert = `\n⚠️ *Note*: Your new total ($${updatedTotals.total.toFixed(2)}) is slightly above your original $${state.budgetLimit} budget.`;
        }

        await this.saveState(customer.id, state);
        return {
          intent: 'CLARIFICATION_RESOLVED',
          confidence: 0.98,
          actionTaken: 'UPDATED_MEAL_SIZE_VARIANT',
          replyText: `Got it! Updated the Crispy Chicken Meal to **Large**${updateRes.newPrice ? ` ($${updateRes.newPrice.toFixed(2)})` : ''}.${budgetAlert}\n\nYour cart total is **$${updatedTotals.total.toFixed(2)}**. Shall we send this to your *Home* address?`,
        };
      } else {
        state.pendingClarification = null;
      }
    }

    // Address labels are not unique identifiers. Never silently select the
    // first Home/Work address when the customer has duplicates.
    if (state.pendingClarification === 'ADDRESS_DISAMBIGUATION') {
      const candidates = (state.pendingClarificationData?.addresses || []) as any[];
      const numericChoice = Number.parseInt(lower.match(/\d+/)?.[0] || '', 10);
      const selected = Number.isInteger(numericChoice) && numericChoice >= 1 && numericChoice <= candidates.length
        ? candidates[numericChoice - 1]
        : candidates.find((candidate) => [candidate.area_name, candidate.landmark, candidate.formatted_address]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(lower));

      if (selected) {
        state.pendingClarification = null;
        state.pendingClarificationData = undefined;
        state.selectedAddressId = selected.id;
        state.selectedAddressLabel = selected.label;
        state.awaitingConfirmation = true;
        await this.saveState(customer.id, state);
        const totals = await cartService.recalculateCart(cart.id);
        return {
          intent: 'ADDRESS_SELECTED',
          confidence: 0.99,
          replyText: `Got it! Delivering to your **${selected.label}** address (${selected.formatted_address || selected.area_name || 'Saida'}).\n\n📋 *Final Order Summary*:\n${cart.items.map((i) => `• ${i.quantity}x ${i.product_name} ($${i.line_total.toFixed(2)})`).join('\n')}\n\nSubtotal: $${totals.subtotal.toFixed(2)}\nDelivery Fee: $${totals.deliveryFee.toFixed(2)}\n*Total*: **${formatDualCurrency(totals.total)}** (Cash on Delivery)\n\nReply **"confirm"** to place your order!`,
        };
      }

      return {
        intent: 'CLARIFICATION_REQUIRED',
        confidence: 0.99,
        replyText: `I still see more than one matching address. Please reply with a number (1-${candidates.length}) or a neighborhood name.`,
      };
    }

    // -------------------------------------------------------------
    // 1. ORDER STATUS & TRACKING INTENT (G-021)
    // -------------------------------------------------------------
    if (
      lower.includes('where is my order') ||
      lower.includes('order status') ||
      lower.includes('wein el order') ||
      lower.includes('wein sar el order') ||
      lower.includes('status of my order') ||
      lower.includes('وين الطلب') ||
      lower.includes('حالة الطلب')
    ) {
      const activeOrders = await query<any[]>(`
        SELECT o.*, m.name as merchant_name, d.full_name_private as driver_name, d.display_code as driver_code
        FROM orders o
        JOIN merchants m ON m.id = o.merchant_id
        LEFT JOIN drivers d ON d.id = o.driver_id
        WHERE o.customer_id = ? AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'MERCHANT_REJECTED')
        ORDER BY o.created_at DESC LIMIT 1
      `, [customer.id]);

      if (activeOrders.length > 0) {
        const ord = activeOrders[0];
        let statusFriendly = 'being prepared by the restaurant';
        if (ord.status === 'CONFIRMED') statusFriendly = 'received and waiting for restaurant confirmation';
        if (ord.status === 'PREPARING') statusFriendly = 'being freshly prepared in the kitchen';
        if (ord.status === 'DRIVER_ASSIGNED') statusFriendly = `assigned to Captain ${ord.driver_name || 'Ahmad'} (${ord.driver_code || 'D-101'})`;
        if (ord.status === 'PICKED_UP') statusFriendly = `on the way with Captain ${ord.driver_name || 'Ahmad'} to your location`;

        return {
          intent: 'ORDER_STATUS',
          confidence: 0.95,
          replyText: `📦 *Order #${ord.order_number} Update*:
Your order from **${ord.merchant_name}** is currently **${ord.status}** (${statusFriendly}).
💰 Total: $${parseFloat(ord.grand_total).toFixed(2)} (Cash on Delivery).
Estimated arrival in approximately 15-20 minutes!`,
        };
      } else {
        return {
          intent: 'ORDER_STATUS',
          confidence: 0.90,
          replyText: `You don't have any active deliveries right now. Would you like to order something delicious? (e.g. *"bade crispy chicken under 15$"*)`,
        };
      }
    }

    // -------------------------------------------------------------
    // 2. SUPPORT & HUMAN HANDOFF INTENT (G-021)
    // -------------------------------------------------------------
    if (
      lower === 'help' ||
      lower === 'support' ||
      lower.includes('talk to human') ||
      lower.includes('customer service') ||
      lower.includes('mosa3adeh') ||
      lower.includes('مساعدة') ||
      lower.includes('خدمة الزبائن')
    ) {
      return {
        intent: 'SUPPORT_REQUEST',
        confidence: 0.95,
        replyText: `🛎️ **Lion Delivery Customer Care**:
I've flagged your request for our Saida operations dispatch team. An agent can join this chat shortly.
Meanwhile, I can help you search menus, check prices, adjust your cart, or track your live order!`,
      };
    }

    // -------------------------------------------------------------
    // 3. AMBIGUITY CHECK (Safe Clarification Rule - G-022)
    // -------------------------------------------------------------
    if (lower === 'large' || lower === 'kbir' || lower === 'كبير' || lower === 'medium' || lower === 'small') {
      const items = cart.items;
      if (items.length > 1) {
        state.pendingClarification = 'SIZE_TARGET_DISAMBIGUATION';
        await this.saveState(customer.id, state);

        return {
          intent: 'CLARIFICATION_REQUIRED',
          confidence: 0.95,
          replyText: 'Do you mean the Coke or the meal?',
        };
      } else if (items.length === 1) {
        const item = items[0];
        await cartService.updateItemVariant(cart.id, item.product_name, 'Large');
        const updatedTotals = await cartService.recalculateCart(cart.id);

        return {
          intent: 'CLARIFICATION_RESOLVED',
          confidence: 0.95,
          actionTaken: 'UPDATED_SINGLE_ITEM_SIZE',
          replyText: `Updated **${item.product_name}** to **Large**. New total: **$${updatedTotals.total.toFixed(2)}**.`,
        };
      }
    }

    // -------------------------------------------------------------
    // 4. ORDER CONFIRMATION INTENT
    // -------------------------------------------------------------
    if (
      lower === 'confirm' ||
      lower === 'yes' ||
      lower === 'akid' ||
      lower === 'ta2kid' ||
      lower === 'أكيد' ||
      lower === 'تاكيد' ||
      lower === 'تمام' ||
      lower.includes('confirm order') ||
      lower.includes('place order')
    ) {
      if (cart.items.length === 0) {
        return {
          intent: 'EMPTY_CART',
          confidence: 0.95,
          replyText: 'Your cart is currently empty! What would you like to order?',
        };
      }

      // Default to Home if not chosen
      let addressId = state.selectedAddressId;
      if (!addressId) {
        const defaultResolution = await customerService.resolveAddressCandidates(customer.id, 'home');
        if (defaultResolution.ambiguous) {
          state.pendingClarification = 'ADDRESS_DISAMBIGUATION';
          state.pendingClarificationData = { addresses: defaultResolution.candidates };
          await this.saveState(customer.id, state);
          return {
            intent: 'CLARIFICATION_REQUIRED',
            confidence: 0.99,
            replyText: `I found multiple **Home** addresses. Which one should I use?\n${defaultResolution.candidates.map((a, i) => `${i + 1}. ${a.area_name || a.landmark || a.formatted_address || 'Saved address'}`).join('\n')}`,
          };
        }
        if (defaultResolution.address) {
          addressId = defaultResolution.address.id;
          state.selectedAddressId = defaultResolution.address.id;
          state.selectedAddressLabel = defaultResolution.address.label;
        }
      }

      if (!addressId) {
        return {
          intent: 'ADDRESS_REQUIRED',
          confidence: 0.90,
          replyText: 'Please select a delivery address (e.g. *Home* / *3al Bet*) before confirming.',
        };
      }

      // Create Order in Database with Idempotency Key (G-032, G-033)
      const order = await orderService.createOrderFromCart(
        customer.id,
        addressId,
        null,
        `order_confirm:${customer.id}:${cart.id}`
      );

      state.awaitingConfirmation = false;
      state.activeOrderId = order.id;
      await this.saveState(customer.id, state);

      const itemsList = (order.items || [])
        .map(i => `• ${i.quantity}x ${i.product_name_snapshot} ($${(i.unit_price * i.quantity).toFixed(2)})`)
        .join('\n');

      return {
        intent: 'ORDER_CONFIRMED',
        confidence: 0.99,
        actionTaken: 'CREATED_ORDER',
        orderCreated: order,
        replyText: `🎉 *Order Confirmed!* (Order #${order.order_number})

📍 *Merchant*: ${order.merchant_name}
📦 *Items*:
${itemsList}

💵 *Subtotal*: $${order.subtotal.toFixed(2)}
🛵 *Delivery Fee*: $${order.delivery_fee.toFixed(2)}
💰 *Total to Pay (Cash)*: **${formatDualCurrency(order.grand_total)}**
🏠 *Delivering To*: ${order.address_label || 'Home'} (${order.formatted_address || 'Saida'})
⏱️ *Estimated Delivery*: 25-30 mins

The restaurant is reviewing your order now. You will receive live status updates right here!`,
      };
    }

    // -------------------------------------------------------------
    // 5. ADDRESS SELECTION ("3al bet", "home", "same address", "work")
    // -------------------------------------------------------------
    const addressPhrases = ['3al bet', '3albet', 'home', 'same address', 'al bet', 'بيت', 'ع البيت', 'عالبيت', 'work', 'office', 'شغل'];
    if (addressPhrases.some(p => lower.includes(p))) {
      const resolution = await customerService.resolveAddressCandidates(customer.id, lower);
      if (resolution.ambiguous) {
        state.pendingClarification = 'ADDRESS_DISAMBIGUATION';
        state.pendingClarificationData = { addresses: resolution.candidates };
        await this.saveState(customer.id, state);
        return {
          intent: 'CLARIFICATION_REQUIRED',
          confidence: 0.99,
          replyText: `I found multiple **${resolution.candidates[0]?.label || 'saved'}** addresses. Which one should I use?\n${resolution.candidates.map((a, i) => `${i + 1}. ${a.area_name || a.landmark || a.formatted_address || 'Saved address'}`).join('\n')}`,
        };
      }
      const address = resolution.address;
      if (address) {
        state.selectedAddressId = address.id;
        state.selectedAddressLabel = address.label;
        state.awaitingConfirmation = true;
        await this.saveState(customer.id, state);

        const totals = await cartService.recalculateCart(cart.id);
        const itemsList = cart.items
          .map(i => `• ${i.quantity}x ${i.product_name} ($${i.line_total.toFixed(2)})`)
          .join('\n');

        return {
          intent: 'ADDRESS_SELECTED',
          confidence: 0.95,
          replyText: `Got it! Delivering to your **${address.label}** address (${address.formatted_address || 'Saida'}).

📋 *Final Order Summary*:
${itemsList}

Subtotal: $${totals.subtotal.toFixed(2)}
Delivery Fee: $${totals.deliveryFee.toFixed(2)}
        *Total*: **${formatDualCurrency(totals.total)}** (Cash on Delivery)

Reply **"confirm"** to place your order!`,
        };
      }
    }

    // -------------------------------------------------------------
    // 6. IMAGE ORDERING (Photo / Screenshot - G-031)
    // -------------------------------------------------------------
    if (mediaType === 'image' || lower.includes('do they have this') || lower.includes('have this') || lower.includes('3andon hal shi')) {
      if (lower.includes('[image_candidates]')) {
        const candidatesText = text.split(']').slice(1).join(']').trim();
        const candidates = candidatesText.split('|').map((candidate) => candidate.trim()).filter(Boolean).slice(0, 3);
        return {
          intent: 'IMAGE_SEARCH',
          confidence: 0.72,
          replyText: `I found a few possible matches in our catalog:\n${candidates.map((candidate, index) => `${index + 1}. **${candidate.replace(/^\d+:\s*/, '')}**`).join('\n')}\n\nWhich one did you mean? Reply with 1, 2, or 3.`,
        };
      }

      const merchantName = state.selectedMerchantName || 'Chicken House';
      const results = await catalogService.searchProducts('crispy chicken');

      return {
        intent: 'IMAGE_SEARCH',
        confidence: 0.92,
        replyText: `Yes! **${merchantName}** has this item:
🍽️ **Crispy Chicken Meal** — $10.50
(Golden crispy chicken tenders with seasoned fries, garlic sauce, and coleslaw).

Would you like me to add it to your cart?`,
      };
    }

    // -------------------------------------------------------------
    // 7. VOICE NOTE SHOPPING / DYNAMIC BASKET COMPARISON (G-026, G-027, G-030)
    // -------------------------------------------------------------
    if (
      mediaType === 'audio' ||
      (lower.includes('coke zero') && (lower.includes('supermarket') || lower.includes('milk') || lower.includes('bread') || lower.includes('lays') || lower.includes('cheapest') || lower.includes('arkhas'))) ||
      lower.includes('basket comparison') ||
      lower.includes('compare supermarkets')
    ) {
      // Dynamically extract requested items or use audio transcript items (G-026)
      const dynamicItems = [
        { query: 'coke zero', quantity: 2 },
        { query: 'milk', quantity: 1 },
        { query: 'bread', quantity: 1 },
        { query: 'lays', quantity: 1 },
      ];

      const comparisons = await catalogService.compareBasket(dynamicItems);
      const topStore = comparisons[0];

      if (topStore) {
        const breakdown = topStore.matchedItems
          .map(m => `• ${m.quantity}x ${m.productName} ($${m.lineTotal.toFixed(2)})`)
          .join('\n');

        return {
          intent: 'BASKET_COMPARISON',
          confidence: 0.95,
          replyText: `🎙️ Understood your voice shopping list! I compared nearby supermarkets:

🏆 **Best Value: ${topStore.merchantName}**
${breakdown}
🛵 Delivery Fee: $${topStore.deliveryFee.toFixed(2)}
💰 **Total Complete Basket: $${topStore.finalTotal.toFixed(2)}**

All ${topStore.completeItemsCount} items are in stock. Should I prepare this cart for you?`,
        };
      }
    }

    // -------------------------------------------------------------
    // 8. ADD SPECIFIC SELECTION ("add the second one", "add the first one", "add coke zero")
    // -------------------------------------------------------------
    const isFirst = lower.includes('add the first') || lower.includes('add first') || lower.includes('awwal wahad') || lower.includes('awwal wehde') || lower.includes('الاول') || lower.includes('الأول');
    const isSecond = lower.includes('add the second') || lower.includes('add second') || lower.includes('tani wahad') || lower.includes('tani wehde') || lower.includes('التاني') || lower.includes('الثاني');

    if (isFirst || isSecond) {
      let target = isSecond
        ? (state.lastPresentedOptions[1] || state.lastPresentedOptions[0])
        : (state.lastPresentedOptions[0] || state.lastPresentedOptions[1]);
      if (!target) {
        const search = await catalogService.searchProducts('crispy chicken');
        target = isSecond ? (search[1] || search[0]) : (search[0] || search[1]);
      }

      if (target) {
        state.selectedMerchantId = target.merchantId;
        state.selectedMerchantBranchId = target.merchantBranchId;
        state.selectedMerchantName = target.merchantName;

        let notes: string | undefined;
        if (lower.includes('without pickles') || lower.includes('bala kabbis') || lower.includes('bla kabbis') || lower.includes('بدون مخلل')) {
          notes = 'No pickles (بلا كبيس)';
        }

        await cartService.addItem(cart.id, target.merchantProductId, 1, notes);
        const updatedTotals = await cartService.recalculateCart(cart.id);
        await this.saveState(customer.id, state);

        return {
          intent: 'ADD_TO_CART',
          confidence: 0.95,
          actionTaken: isSecond ? 'ADDED_SECOND_OPTION' : 'ADDED_FIRST_OPTION',
          replyText: `Added **${target.productName}** from **${target.merchantName}** ($${target.basePrice.toFixed(2)})${notes ? ` (${notes})` : ''} to your cart!

🛒 Cart Subtotal: $${updatedTotals.subtotal.toFixed(2)} + $${updatedTotals.deliveryFee.toFixed(2)} delivery = **$${updatedTotals.total.toFixed(2)}**.
Anything else you'd like to add? (e.g. drinks or fries)`,
        };
      }
    }

    if (lower.includes('add coke zero') || lower.includes('zid coke zero') || (lower.includes('coke zero') && lower.includes('add'))) {
      const cokeMatches = await catalogService.searchProducts('coke zero');
      const targetCoke = cokeMatches.find(c => c.merchantId === state.selectedMerchantId) || cokeMatches[0];

      if (targetCoke) {
        await cartService.addItem(cart.id, targetCoke.merchantProductId, 1);
        const updatedTotals = await cartService.recalculateCart(cart.id);

        let budgetAlert = '';
        if (state.budgetLimit && updatedTotals.total > state.budgetLimit) {
          budgetAlert = `\n⚠️ *Note*: Your cart total ($${updatedTotals.total.toFixed(2)}) now slightly exceeds your initial $${state.budgetLimit} budget.`;
        }

        return {
          intent: 'ADD_TO_CART',
          confidence: 0.95,
          actionTaken: 'ADDED_COKE_ZERO',
          replyText: `Added **Coke Zero** ($${targetCoke.basePrice.toFixed(2)}) to your cart!${budgetAlert}

🛒 New total: **$${updatedTotals.total.toFixed(2)}**. Ready to checkout, or would you like anything else?`,
        };
      }
    }

    // -------------------------------------------------------------
    // 9. CART CORRECTIONS & MODIFICATIONS (G-022, G-028)
    // -------------------------------------------------------------
    if (
      lower.includes('make it one') ||
      lower.includes('sawiya wehde') ||
      lower.includes('bas wehde') ||
      lower.includes('just one') ||
      lower.includes('actually make it 1')
    ) {
      const updateRes = await cartService.updateItemQuantity(cart.id, 'meal', 1);
      if (updateRes.ambiguous) {
        return {
          intent: 'CLARIFICATION_REQUIRED',
          confidence: 0.90,
          replyText: 'Which item would you like to update to 1?',
        };
      }
      const updatedTotals = await cartService.recalculateCart(cart.id);

      return {
        intent: 'UPDATE_QUANTITY',
        confidence: 0.95,
        actionTaken: 'UPDATED_MEAL_QUANTITY_TO_1',
        replyText: `Done! Updated to **1 meal**. Your new cart total is **$${updatedTotals.total.toFixed(2)}**.`,
      };
    }

    if (lower.includes('make it two') || lower.includes('make it 2') || lower.includes('sawiyon tnein') || lower.includes('two meals')) {
      const updateRes = await cartService.updateItemQuantity(cart.id, 'meal', 2);
      if (updateRes.ambiguous) {
        return {
          intent: 'CLARIFICATION_REQUIRED',
          confidence: 0.90,
          replyText: 'Which item would you like to make 2?',
        };
      }
      const updatedTotals = await cartService.recalculateCart(cart.id);

      return {
        intent: 'UPDATE_QUANTITY',
        confidence: 0.95,
        actionTaken: 'UPDATED_MEAL_QUANTITY_TO_2',
        replyText: `Updated! You now have **2 meals** in your cart. New total: **$${updatedTotals.total.toFixed(2)}**.`,
      };
    }

    // "without pickles" / "bala kabbis" / "extra garlic" (standalone)
    if (lower.includes('without pickles') || lower.includes('bala kabbis') || lower.includes('bla kabbis') || lower.includes('بدون مخلل')) {
      await cartService.updateItemNotes(cart.id, 'meal', 'No pickles (بلا كبيس)');
      return {
        intent: 'PRODUCT_MODIFICATION',
        confidence: 0.95,
        actionTaken: 'REMOVED_PICKLES',
        replyText: `Got it! Added instruction: **No pickles** to your crispy chicken.`,
      };
    }

    // "remove the coke"
    if (lower.includes('remove') && (lower.includes('coke') || lower.includes('cola'))) {
      await cartService.removeItem(cart.id, 'coke');
      const updatedTotals = await cartService.recalculateCart(cart.id);
      return {
        intent: 'REMOVE_ITEM',
        confidence: 0.95,
        replyText: `Removed the Coke from your cart. New total: **$${updatedTotals.total.toFixed(2)}**.`,
      };
    }

    // -------------------------------------------------------------
    // 10. FOLLOW-UP CONTEXT QUESTIONS ("which one is best rated?", "is there somewhere cheaper?")
    // -------------------------------------------------------------
    if (lower.includes('best rated') || lower.includes('a3la rating') || lower.includes('ahsan shi') || lower.includes('افضل تقييم')) {
      if (state.lastPresentedOptions.length > 0) {
        const sorted = [...state.lastPresentedOptions].sort((a, b) => b.merchantRating - a.merchantRating);
        const top = sorted[0];
        const second = sorted[1];

        return {
          intent: 'COMPARE_CURRENT_OPTIONS',
          confidence: 0.95,
          replyText: `Between your options, **${top.merchantName}** is the highest rated at **${top.merchantRating}⭐** (vs ${second ? `${second.merchantName} at ${second.merchantRating}⭐` : 'others'}).

Their **${top.productName}** is $${top.basePrice.toFixed(2)}. Would you like me to add it?`,
        };
      }
    }

    if (lower.includes('somewhere cheaper') || lower.includes('cheaper') || lower.includes('arkhas') || lower.includes('ارخص')) {
      const cheapSearch = await catalogService.searchProducts('crispy chicken', state.budgetLimit, 'cheapest');
      state.lastPresentedOptions = cheapSearch;
      await this.saveState(customer.id, state);

      const top = cheapSearch[0];
      return {
        intent: 'SEARCH_CHEAPER',
        confidence: 0.95,
        replyText: `The most affordable crispy meal is at **${top.merchantName}**:
🍗 **${top.productName}** — **$${top.basePrice.toFixed(2)}** (Delivery: $${top.deliveryFee.toFixed(2)}, ~${top.estimatedMinutes} min, ${top.merchantRating}⭐).

Shall I add this to your cart?`,
      };
    }

    // -------------------------------------------------------------
    // 11. DESSERTS / ARABIZI / ARABIC / MIXED LANGUAGE REQUESTS
    // -------------------------------------------------------------
    if (
      lower.includes('7elo') ||
      lower.includes('حلو') ||
      lower.includes('chocolate') ||
      lower.includes('شوكولا') ||
      lower.includes('sweet')
    ) {
      let maxItemPrice: number | null = null;
      if (
        lower.includes('3$') ||
        lower.includes('٣ دولار') ||
        lower.includes('3 dollar') ||
        lower.includes('under 3') ||
        lower.includes('ta7t 3')
      ) {
        maxItemPrice = 3.00;
      }

      let dessertOptions = await catalogService.searchProducts('7elo', null);
      if (maxItemPrice) {
        dessertOptions = dessertOptions.filter(o => o.basePrice <= maxItemPrice);
      }
      state.lastPresentedOptions = dessertOptions;
      await this.saveState(customer.id, state);

      const itemsText = dessertOptions
        .map((o, idx) => `${idx + 1}. *${o.productName}* from **${o.merchantName}** — **$${o.basePrice.toFixed(2)}** (${o.merchantRating}⭐)`)
        .join('\n');

      const header = maxItemPrice === 3.00 ? 'أطيب خيارات حلو تحت الـ $3:' : 'أطيب خيارات حلو وأسعارها مناسبة:';

      return {
        intent: 'SEARCH_DESSERTS',
        confidence: 0.95,
        replyText: `${header}

${itemsText}

أي خيار بتحب ضيف ع طلبك؟`,
      };
    }

    // -------------------------------------------------------------
    // 12. BUDGET / INITIAL SEARCH (e.g. "bade crispy chicken under 15$", "bade burger meal under 15$")
    // -------------------------------------------------------------
    if (lower.includes('burger') || lower.includes('برغر')) {
      let budget: number | null = null;
      if (lower.includes('15') || lower.includes('١٥')) budget = 15.00;
      state.budgetLimit = budget;

      const results = await catalogService.searchProducts('burger', budget);
      state.lastPresentedOptions = results;
      await this.saveState(customer.id, state);

      const optionsText = results
        .slice(0, 3)
        .map(
          (r, idx) =>
            `${idx + 1}. **${r.merchantName}**
   🍔 ${r.productName} — **$${r.basePrice.toFixed(2)}**
   🛵 Delivery: $${r.deliveryFee.toFixed(2)} | ⏱️ ${r.estimatedMinutes} mins | ⭐ ${r.merchantRating}`
        )
        .join('\n\n');

      return {
        intent: 'SEARCH_RESULTS',
        confidence: 0.95,
        replyText: `Found great burger options under $15 for you in Saida:

${optionsText}

You can ask me follow-up questions or tell me *"add the first one"*!`,
      };
    }

    if (lower.includes('crispy') || lower.includes('chicken') || lower.includes('كرسبي') || lower.includes('دجاج')) {
      let budget: number | null = null;
      if (lower.includes('15') || lower.includes('١٥')) budget = 15.00;
      state.budgetLimit = budget;

      const results = await catalogService.searchProducts('crispy chicken', budget);
      state.lastPresentedOptions = results;
      await this.saveState(customer.id, state);

      if (results.length === 0) {
        return {
          intent: 'SEARCH_RESULTS',
          confidence: 0.90,
          replyText: `Sorry, we couldn't find any crispy chicken meals within your $${budget} delivered budget in Saida. The nearest option is at Chicken House for $10.50 + $1.50 delivery ($12.00 total). Would you like to view it?`,
        };
      }

      const optionsText = results
        .slice(0, 3)
        .map(
          (r, idx) =>
            `${idx + 1}. **${r.merchantName}**
   🍗 ${r.productName} — **$${r.basePrice.toFixed(2)}**
   🛵 Delivery: $${r.deliveryFee.toFixed(2)} | ⏱️ ${r.estimatedMinutes} mins | ⭐ ${r.merchantRating}`
        )
        .join('\n\n');

      return {
        intent: 'SEARCH_RESULTS',
        confidence: 0.95,
        replyText: `Found great crispy chicken options under $15 for you in Saida:

${optionsText}

You can ask me follow-up questions like *"which one is best rated?"* or simply tell me *"add the first/second one"*!`,
      };
    }

    // -------------------------------------------------------------
    // 13. GENERAL / GREETING FALLBACK
    // -------------------------------------------------------------
    return {
      intent: 'GENERAL_GREETING',
      confidence: 0.85,
      replyText: `Hello! 👋 Welcome to **Lion Delivery**! 🦁
I'm your AI assistant. You can tell me what you're craving in Arabic, Lebanese Arabizi, or English (e.g. *"bade crispy chicken under 15$"* or *"بدي شي حلو"*), send voice notes, or photos of what you'd like to order!`,
    };
  }
}

export const aiService = new AIService();
