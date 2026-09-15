# Lion Customer Conversation Gaps and Gemini Training Plan

Status: planning document only. No application code is changed by this document.

Date: 2026-09-15

Scope: the seven customer-chat screenshots, customer-facing formatting, conversation context, address handling, item understanding, multi-merchant ordering, and order tracking.

## Decisions already made

- Gemini is the only AI provider for customer conversations. Do not reintroduce Smart NLU.
- Customer-facing replies must be plain WhatsApp text. They must not contain Markdown asterisks, Markdown heading markers, or the lion emoji.
- The assistant must use the language and script of the latest customer message.
- A catalog miss, an address miss, an absent order, and an unclear message are different situations. They must never collapse into the same generic catalog response.
- The assistant must use verified conversation state and the relevant preceding messages before deciding what a new message means.
- A request involving two merchants must become two separate orders, not a destructive merchant switch, when the customer explicitly asks for both.
- An address or checkout change never creates an order by itself. The customer must see the correct final summary and explicitly confirm the intended order or order batch.

## Executive diagnosis

The screenshots do not show one isolated model mistake. They expose five connected design gaps:

1. The current customer-output instructions explicitly encourage Markdown, decorative emojis, and a lion emoji. This is why those characters appear even when the information itself is correct.
2. The current fallback path treats several unrelated backend outcomes as a catalog miss. In particular, address-not-found and no-order-found can be replaced by the catalog-miss sentence.
3. The model receives some context, but the context is not authoritative enough. Recent history is short-lived Redis data, only a small portion is sent to Gemini, and there is no explicit per-turn rule saying that the pending task owns the next customer answer.
4. Address capture is not separated from catalog search. A free-text Lebanese address can therefore be read as a product query. The existing saved-address resolver also has a dangerous default-address fallback when no phrase matches.
5. The present cart model is intentionally single-merchant. Its merchant-switch behavior clears the first cart. Two restaurant orders require a real order-batch design, not a stronger prompt alone.

These are product and orchestration problems around Gemini, not proof that Gemini cannot understand the customer. The remedy is Gemini-guided reasoning with strict state, tool, response-type, and evaluation rules.

## Evidence from the current implementation

The following source findings explain the observed output and should guide the later implementation:

| Finding | Why it matters |
|---|---|
| The Gemini system prompt currently tells the assistant to use bold text, bullet characters, and emojis, including the lion emoji. | The unwanted formatting is an instructed behavior, not a random one-off response. |
| `interactive-not-found.ts` treats `ADDRESS_NOT_FOUND` and `NO_ORDER_FOUND` like product catalog misses. `gemini.service.ts` then replaces the final response with the generic catalog-miss sentence. | This directly explains why an address or order-status message can receive “I couldn't find that within my current catalog.” |
| Gemini history is kept in Redis for 24 hours and the prompt receives only the last six stored turns. State is keyed by customer rather than being a durable, explicit conversation transcript and next-action record. | A greeting or short answer can lose the practical meaning of the current task and restart a conversational loop. |
| The saved-address resolver can return the default saved address when an arbitrary phrase does not actually match an address. | The desired behavior is to say that the requested address was not found and offer to add it, never silently choose another address. |
| The active cart has one merchant branch and the cross-merchant guard proposes clearing it before switching. | “Order from both places” cannot safely work until the data and checkout workflow support two independent carts/orders. |
| Catalog search has aliases and Arabizi normalization, but the available demo catalog includes Coke products and does not appear to include Pepsi or Kenza/Kinza. | The assistant must understand the customer’s drink intent, try spelling and alias resolution, and offer only verified alternatives. It must not pretend that an unavailable item exists. |

## Global customer-output contract

This contract applies to Gemini replies, local safety replies, order receipts, address summaries, dashboard operator replies, and provider-error messages.

### Plain-text presentation

- Do not emit `*`, `**`, `#`, or Markdown headings in customer text.
- Do not emit the lion emoji.
- Use short paragraphs and ordinary hyphen lists when a list is useful.
- Do not use decorative emojis by default. Product facts, prices, addresses, and order numbers must remain readable without emoji.
- Write an order identifier as `Order LION-2026-001`, not `Order #LION-2026-001`.
- Preserve verified product names, merchant names, prices, order numbers, and address labels exactly as tools return them.
- Run a final customer-output formatting validator after Gemini and after every deterministic template. The validator may remove forbidden presentation characters but must not invent, translate, or alter business facts.

Example of the desired style:

```text
Your cart from Chicken House is ready.

- Crispy Chicken Meal x1: $10.50
- Delivery: $1.50
- Total: $12.00

Send your delivery address, or say Home if you have it saved.
```

### Language contract

- English input receives English output.
- Arabizi input receives Lebanese Arabizi in Latin letters and numerals.
- Arabic-script input receives Arabic script.
- French input receives French.
- A mixed message receives a natural equivalent mixed response.
- A short follow-up such as `yes`, `1`, `both`, or `hello` inherits the customer’s latest meaningful language and the active task only when the context makes that interpretation safe.

### Response-type contract

Gemini must select one response type before composing a reply. The backend validates the response type against tool outcomes and state.

| Response type | When it is allowed | Required content | Forbidden content |
|---|---|---|---|
| Clarification | The message has no reliable meaning or a required entity is ambiguous. | One short question and useful examples. | Catalog-miss wording, cart mutation, order creation. |
| Product miss | A product/category search completed with no verified match. | State that the item was not found, ask whether to try another item/name, optionally show verified alternatives only if the customer requested alternatives. | Address/order wording, invented substitutions. |
| Address miss | The customer selected a saved address that does not exist, or supplied an unvalidated/unserviceable address. | State that the address was not found or cannot yet be confirmed; offer add-address, location-pin, or landmark next step. | Catalog-miss wording, automatic default-address selection. |
| No active order | Order tracking found no active order. | State exactly that there is no active order right now and invite a new order if appropriate. | Catalog-miss wording, invented order status. |
| Checkout summary | A valid address and cart/order plan are ready for confirmation. | Itemized summary, fees, destination, explicit confirmation phrase. | Order creation before confirmation. |
| Multi-order plan | Items resolve to more than one merchant and customer wants all of them. | Separate order summaries, separate fees, address decision, batch confirmation instruction. | Clearing an existing cart or pretending both merchants are one order. |

## Conversation priority model

Before Gemini searches the catalog or composes a greeting, it must read the verified context and follow this priority order.

| Priority | Condition | Required Gemini action |
|---:|---|---|
| 1 | A safety interruption: cancel, support, explicit order tracking, or an error recovery request. | Use the corresponding controlled tool and preserve unrelated carts/orders unless the customer explicitly changes them. |
| 2 | A pending task exists: address selection, address confirmation, product/variant clarification, merchant/order-batch choice, or final confirmation. | Interpret the new message as an answer to that pending task before treating it as a fresh catalog query. |
| 3 | The message is a detailed address or a location while an address is expected. | Run address capture/validation, never catalog search. |
| 4 | The customer names a product, category, merchant, budget, quantity, or add/remove intent. | Resolve the product against verified catalog data and current merchant/order context. |
| 5 | The message is a greeting during an active task. | Acknowledge briefly and restate the exact pending question; do not reset the conversation. |
| 6 | The message is truly unintelligible and does not safely answer a pending task. | Ask a short clarification question. Do not call a mutation or catalog tool. |

The state supplied to Gemini must contain, at minimum:

- Conversation ID and ordered turn number.
- Current stage and one explicit `next_required_action`.
- The last assistant question and the entity it expects next.
- Current cart or carts, merchant names, and selected items.
- Any pending product candidates or spelling/alias candidates.
- Saved-address labels, selected address, and an address draft if one was supplied.
- Active orders and a pending multi-order batch if one exists.
- The last relevant customer language/script.

The source of truth must be durable conversation data plus current database state. Redis can remain a performance cache, but it must not be the only place that holds the meaning of an unfinished customer conversation.

## Screenshot-by-screenshot gap register

### CG-01: Unintelligible message receives an oversized branded welcome

Observed behavior:

- A one-character message such as `J` receives a long welcome with Markdown, the lion emoji, other decorative emojis, and several unrelated examples.

Why this is wrong:

- `J` has no reliable ordering meaning.
- The reply is visually noisy and does not tell the customer what the system needs next.
- It violates the plain-text output requirement.

Required behavior:

- When no pending task can make the short message meaningful, Gemini asks one plain, language-matched clarification question.
- It must not search, change a cart, create a customer order, or send the generic welcome flow.

Desired English reply:

```text
I did not understand that. What would you like to do: order food, add an item, send a delivery address, or check an order?
```

Desired Arabizi reply:

```text
Ma fhemet 3layk. Shou baddak ta3mel: tetlob akel, tzid item, teb3at 3enwen, aw tetba3 talab?
```

Implementation requirements for later:

1. Replace the welcome-first fallback with a Gemini clarification response type.
2. Add a post-generation presentation filter for `*`, `#`, and the lion emoji.
3. Remove Markdown and lion-emoji instructions from every prompt, few-shot example, localizer string, order template, and dashboard-send template.
4. Add tests for blank input, one-character input, accidental keyboard input, and short input that is a valid answer to a pending question.

Acceptance criteria:

- `J` in an idle conversation asks for clarification in one concise message.
- `1` after a numbered product list selects option 1 instead of asking a generic clarification.
- No output path emits `*`, `#`, or the lion emoji.

### CG-02: Greeting resets or loops instead of continuing the active conversation

Observed behavior:

- The customer asks an Arabizi question about affordable food.
- The assistant asks for budget/category details.
- The customer says `Hello` and receives a fresh generic greeting instead of a useful continuation of the existing question.

Why this is wrong:

- A greeting is not a request to discard the active task.
- The model has conversation history and state, but it has no strong imperative to preserve the pending task when the message is conversational filler.

Required behavior:

- A greeting during an unfinished task acknowledges the greeting and restates exactly one pending question.
- The assistant should not repeat a welcome, erase previous options, or start a loop.

Desired Arabizi reply when the pending task is food preferences:

```text
Ahlan. Kna 3am n7awel nle2ilak akel 3a 2add budgetak. Shou btfaddel: burger, shawarma, aw crispy chicken? W 2adde budgetak?
```

Desired English reply when the pending task is address collection:

```text
Hello. Your cart is still ready. Please send the delivery address, say Home if it is saved, or share a location pin.
```

Implementation requirements for later:

1. Persist `next_required_action`, `last_assistant_question`, and expected entities in a durable conversation record.
2. Include a compact, chronological conversation summary plus the current state in every Gemini request.
3. Make greeting handling state-aware. It is a continuation unless the customer explicitly says they want to start over, clear the cart, or begin a new order.
4. Serialize customer turns by conversation ID so rapid WhatsApp messages cannot be interpreted against stale state.
5. Add a long-running conversation test that survives Redis expiration/restart by reconstructing state from persisted conversation data.

Acceptance criteria:

- A greeting in `SELECTING_OPTION`, `SELECTING_ADDRESS`, `AWAITING_CONFIRMATION`, or `MULTI_ORDER_REVIEW` preserves that stage.
- The response mentions the correct pending task and does not show a generic welcome.
- A clear request to start over asks whether to preserve or clear the current cart; it never clears by assumption.

### CG-03: A detailed Lebanese address is treated as a catalog search

Observed behavior:

- The customer is asked for a delivery address.
- The customer sends a detailed Saida/Abra address with landmarks and turn-by-turn directions.
- The assistant answers with the generic catalog-miss sentence.

Why this is wrong:

- The active conversation stage already expects an address.
- Free-text address capture is not a dedicated intent/tool path, so the message can fall through to product search.
- The global not-found override hides the true reason for failure.

Required behavior:

- When address information is expected, a detailed message is an address draft, not a product query.
- The system validates the delivery area and enough usable detail. It then asks whether to use/save the address and shows the order summary before any order confirmation.
- If the details cannot be verified or are outside the service area, it explicitly asks for a location pin, a nearby landmark, or a corrected address.

Desired Arabizi reply after a valid detailed address:

```text
Fhemet 3enwenak bi Abra. Baddak esta3mlo la hal talab? Ra7 farjik l molakhas l nehe2e w ba3den baddak t2akked.
```

Desired reply when the address cannot be confirmed:

```text
Ma 2dert 2akked hal 3enwen. Fik teb3at location pin aw t2elle 2reb ma3lam? Ma ra7 7ott l talab 2abel ma nt2akkad men l 3enwen.
```

Implementation requirements for later:

1. Add an explicit Gemini-controlled address-capture action separate from `select_delivery_address`.
2. Represent address status as `saved`, `draft`, `ambiguous`, `unvalidated`, `serviceable`, or `unserviceable`.
3. Match saved labels only when the customer is actually selecting a saved address. Treat longer address-like text as a draft.
4. Validate the draft against service area/zone and ask the customer to confirm it before using it for checkout.
5. Never route any message to `search_catalog` while the active state expects address information unless the customer explicitly changes topic to product search.
6. Keep full address details out of AI telemetry and logs except where securely required for fulfillment.

Acceptance criteria:

- A free-text Arabic, Arabizi, English, or French address in `SELECTING_ADDRESS` never produces a product-miss reply.
- The order remains uncreated until a final summary and explicit confirmation.
- Unserviceable or insufficient addresses get an address-specific next step, not a generic catalog message.

### CG-04: Customer asks for two restaurants, but the system insists on one merchant

Observed behavior:

- The customer chooses items from Chicken House and Burger Spot.
- They explicitly say `Order from both places`.
- The assistant insists that only one restaurant can be processed and offers a merchant switch.

Why this is wrong:

- The customer made the desired business rule explicit: two separate orders.
- The current one-cart/one-merchant rule protects data integrity, but it does not satisfy the requested delivery experience.
- A prompt-only change would be unsafe because the current merchant-switch path clears the first cart.

Required behavior:

- Gemini recognizes a multi-merchant intent when the customer says both, separate orders, one from each, or equivalent Arabic/Arabizi wording.
- The system creates a pending order batch with one independent cart/order plan per merchant.
- It asks whether both orders use the same address if that is not already known.
- It displays two separate summaries and delivery fees, then requires a clear batch confirmation such as `confirm both`.
- After confirmation, it creates two idempotent orders and replies with both order numbers. If one creation fails, the result must clearly state which order succeeded or failed; it must never lose the other merchant's cart silently.

Desired English flow:

```text
I can place two separate orders.

Order 1 from Chicken House
- Crispy Chicken Meal x1
- Delivery: $1.50

Order 2 from Burger Spot
- Double Crispy Meal x1
- Delivery: $1.50

Should both orders go to the same address? After I show the final totals, reply confirm both to place them.
```

Desired Arabizi confirmation instruction:

```text
Fini e3mel talabayn mfassalin, wa7ad men kel mat3am. Ba3d ma farjik kel molakhas w l total, rodd confirm both ta n7ot l talabayn.
```

Required product/data design:

1. Add an `order_batch` or equivalent parent record with a customer ID, batch idempotency key, shared/individual delivery-address decisions, and batch status.
2. Keep one child cart and one child order per merchant branch. Do not reuse the destructive merchant-switch mechanism.
3. Calculate each merchant's delivery fee, tax, minimum order, availability, and ETA separately from verified backend data.
4. Decide and document payment behavior. The safe default is two separate cash-on-delivery totals unless the business explicitly supports a consolidated payment.
5. Support `confirm 1`, `confirm 2`, `confirm both`, and explicit cancellation of one child order before placement.
6. Use transactional/idempotent creation so a repeated WhatsApp delivery cannot duplicate either child order.

Acceptance criteria:

- “Both”, “order from both places”, and Arabic/Arabizi equivalents create a multi-order review, not a merchant-switch prompt.
- Both original item selections remain preserved until the customer accepts/rejects the plan.
- Two confirmed merchant selections generate two distinct order numbers and auditable order records.
- A customer can decline one order without losing the other.

### CG-05: Vague or misspelled drink requests do not preserve intent

Observed behavior:

- The customer has a Chicken House meal in the cart and says `Add drink`.
- They follow with `Kinza` and then `Pepsi`.
- The assistant gives the generic catalog-miss sentence rather than understanding the drink request, checking spelling/aliases, or offering verified next choices.

Why this is wrong:

- `Add drink` establishes a pending product category. The next one-word message is likely the drink name, not an unrelated new query.
- The available catalog may not contain Pepsi or Kenza/Kinza, but lack of availability is not the same as failure to understand the customer.
- The system needs an explicit distinction between exact catalog absence, spelling uncertainty, current-merchant availability, and cross-merchant sourcing.

Required behavior:

1. On a category-only add request, first search the active merchant's verified beverage menu. If several choices exist, show them or ask for the drink name.
2. Store `pending_product_category = beverage` and the current merchant context.
3. For `Kinza`, try aliases, Arabic/Arabizi transliteration, spelling candidates, and phonetic normalization. For example, evaluate whether the customer meant `Kenza` before declaring a miss.
4. For `Pepsi`, search the active merchant first. If it is not available, say so specifically and offer only verified drink alternatives from that merchant or explicitly ask permission to add a separate merchant order.
5. Never silently substitute Coke for Pepsi. A verified alternative must be clearly presented as an alternative and still require customer choice.

Desired English reply when Pepsi is not on the active merchant menu but Coke is verified:

```text
I could not find Pepsi on Chicken House's current menu. They do have Coca-Cola Regular Can and Coca-Cola Zero Can. Would you like one of those, or should I search another place for Pepsi?
```

Desired Arabizi reply when the name may be misspelled:

```text
2asdak Kenza? Ma la2ayta 3a menu Chicken House l 7ale. Fini farjik l mashroubet l mawjoude 3endon aw fattesh 3a mahal tene iza baddak.
```

Implementation requirements for later:

1. Add a Gemini tool/result contract for product resolution with stages: exact match, alias match, spelling candidate, verified alternative, and no match.
2. Expand catalog aliases from real merchant inventory and human-reviewed Lebanese spelling variants. Do not add fictional aliases that point to an unavailable product.
3. Carry a pending category and target merchant across follow-up messages.
4. Prefer current-merchant results when modifying an existing order; offer a multi-order path only after clearly explaining the merchant difference.
5. Make every “not found” response name the missing thing and the correct next action.

Acceptance criteria:

- `Add drink` followed by a one-word drink name is interpreted in beverage context.
- Spelling variants are checked before a final product-miss response.
- The assistant never claims Pepsi/Kenza is available unless a verified catalog tool returned it.
- A product miss preserves the cart and the pending beverage decision.

### CG-06: Home/address phrases in Arabic are mistaken for catalog requests

Observed behavior:

- The assistant asks for an address.
- The customer replies in Arabic with a home-address phrase such as `عل بيت`.
- The assistant responds with the catalog-miss sentence.

Why this is wrong:

- The message is a clear address-selection answer in the surrounding context.
- Arabic and Lebanese variants of home must resolve through the same address path as English `Home` and Arabizi `3al bet`.
- If the address is absent, the customer needs an address-specific response, not a catalog message.

Required behavior:

- Normalize Arabic-script home phrases, Arabizi home phrases, and English home phrases into a saved-address selection attempt only when address selection is expected.
- If one saved Home address exists, select it and show the final summary.
- If multiple Home addresses exist, ask which one.
- If no Home address exists, say that Home is not saved and offer to add it with a full address or location pin.
- Do not fall back to a default address simply because no exact address phrase matched.

Desired Arabic reply when Home is not saved:

```text
ما لقيت عنوان محفوظ باسم البيت. بدك تضيفه؟ ابعت العنوان الكامل أو لوكيشن، وبعدها بفرجيك ملخص الطلب قبل التأكيد.
```

Desired Arabizi reply when Home is saved:

```text
Tamam, ra7 nesta3mel 3enwen Home. Halla2 farjik molakhas l talab l nehe2e, w ma ra7 n7otto ella ba3d ta2kid wade7.
```

Implementation requirements for later:

1. Correct Unicode-safe Arabic normalization and expand Lebanese home/work equivalents through human review.
2. Change saved-address resolution so an unmatched phrase returns a true miss, never a default address.
3. Add an address-specific error renderer. `ADDRESS_NOT_FOUND` must never flow through the catalog-miss renderer.
4. Add a save-address consent step for newly captured addresses, including label suggestion such as Home, Work, or a customer-provided label.

Acceptance criteria:

- Arabic, Arabizi, and English Home phrases take the address path while address selection is pending.
- No saved Home address results in an add-address invitation.
- The system does not select a different/default saved address without an explicit customer choice.

### CG-07: Order tracking with no order is reported as a catalog miss

Observed behavior:

- A customer asks `Where is my order??`.
- The customer has no active order.
- The assistant answers with the generic catalog-miss sentence.

Why this is wrong:

- Order tracking is a separate intent and must be resolved before catalog search.
- `NO_ORDER_FOUND` has a known business meaning: no active order right now.
- The customer must not think the bot misunderstood food when they asked about delivery status.

Required behavior:

- Gemini calls the order-status tool first for order-status language in all supported scripts/styles.
- If no active order exists, it states this plainly and gives an optional next step.
- If a recent completed/cancelled order exists, the response distinguishes it from an active order rather than inventing an active delivery.

Desired English reply:

```text
You do not have an active order right now. Would you like to start a new order?
```

Desired Arabizi reply:

```text
Ma 3andak talab neche6 halla2. Baddak tballech talab jdid?
```

Implementation requirements for later:

1. Make order-tracking intent precedence explicit in the Gemini prompt and tool contract.
2. Split tool outcomes into `ACTIVE_ORDER_FOUND`, `RECENT_ORDER_FOUND`, and `NO_ACTIVE_ORDER`.
3. Add a dedicated no-active-order renderer and block the generic catalog-miss renderer for all order outcomes.
4. Expand multilingual training examples: where is my order, wein el order, wen sar talab, وين طلبي, وين صار الطلب, and French equivalents.

Acceptance criteria:

- Tracking phrases never call catalog search unless the customer explicitly changes intent.
- No active order produces the exact business fact “no active order right now.”
- The response contains no product-catalog wording and does not show a made-up order number or ETA.

## Error taxonomy that prevents wrong fallbacks

The current generic “not found” rule is too broad. Replace it with a response dispatcher driven by structured tool outcome, current stage, and response language.

| Backend/tool outcome | Customer response category | Correct next question |
|---|---|---|
| No catalog matches | Product miss | “I could not find [item]. Would you like to try another name or see available alternatives?” |
| Item is absent from current cart | Cart-item miss | “That item is not in your current cart. Would you like to see the cart?” |
| Variant is unavailable | Variant miss | “That size/flavor is not available. Which of these verified options would you like?” |
| Saved address missing | Address miss | “I could not find that saved address. Would you like to add it or send a location pin?” |
| Address draft cannot be validated | Address validation | “I could not confirm this address. Please send a location pin or nearby landmark.” |
| No active order | No active order | “You do not have an active order right now. Would you like to start one?” |
| No order matching a provided number | Order-number miss | “I could not find that order number. Please check it or tell me to show your recent orders.” |
| Message has no reliable meaning | Clarification | “I did not understand that. What would you like to do?” |
| Cross-merchant request | Multi-order plan | “I can make separate orders. Should both go to the same address?” |

The important rule is not merely different wording. The response category must be chosen before text generation so Gemini cannot turn a known address/order failure into a product-miss answer.

## Gemini-only training program

This is a Gemini-only program. It does not add Smart NLU, a separate intent model, or a local fallback model.

Deterministic code remains necessary only to enforce business truth, validate tool arguments, preserve order safety, route structured tool outcomes to the correct response category, and enforce the plain-text presentation contract. It must not pretend to be a second language-understanding system.

### Phase 1: Gemini controller contract

Use Gemini function calling/structured output for every customer turn. Before composing customer text, Gemini should return a constrained plan containing:

```json
{
  "intent": "SELECT_ADDRESS",
  "context_reference": "awaiting_delivery_address",
  "response_type": "address_draft",
  "tool_calls": [
    {
      "name": "capture_delivery_address",
      "arguments": {
        "raw_address": "customer message"
      }
    }
  ],
  "requires_customer_confirmation": true
}
```

The server validates that:

- The response type is compatible with the state and tool result.
- The tool is allowed at that stage.
- An address/order/product error keeps its own response category.
- A mutation/order creation needs all required confirmations.
- The final text is plain text and language-matched.

### Phase 2: Replace the current few-shot set with reviewed scenario packs

The present prompt examples teach formatting that the customer does not want and do not cover the seven failures well enough. Replace them with compact, human-reviewed scenario packs selected by stage:

- Idle and unclear-message examples.
- Greeting while task is pending examples.
- Detailed address and saved-address examples.
- Product category, spelling, alias, and unavailable-product examples.
- Multi-merchant separate-order examples.
- No-active-order and recent-order examples.
- Explicit confirmation and rejection examples.

Do not load hundreds of examples into every prompt. Retrieve a small set by current stage and response category, then include the durable state summary and last relevant turns.

### Phase 3: Gold data creation

Create a reviewed dataset with this schema for each turn:

| Field | Purpose |
|---|---|
| `conversation_id`, `turn_index` | Preserve multi-turn sequencing. |
| `history_summary`, `state_before`, `next_required_action` | Make context use testable. |
| `customer_message`, `language`, `script` | Test natural language and language mirroring. |
| `intent`, `response_type`, `expected_tool` | Test Gemini planning. |
| `expected_tool_arguments` | Test grounding and entity extraction. |
| `required_reply_facts`, `forbidden_reply_facts` | Test correct customer outcome. |
| `forbidden_tools`, `mutation_allowed` | Test safety. |
| `format_constraints` | Assert no Markdown, no lion emoji, concise reply. |
| `human_review_status`, `reviewer_language` | Ensure Lebanese Arabic/Arabizi quality. |

Minimum initial corpus:

- 60 reviewed turns for each of the seven screenshot scenarios.
- Each scenario represented in English, Arabizi, and Arabic script where natural.
- At least 30 adversarial/context-switch turns: greetings mid-flow, bare `yes`, `both`, numeric selection, typo, slang, topic interruption, and repeated WhatsApp delivery.
- At least 20 catalog fixtures where the requested thing is actually absent, so the model learns not to hallucinate.
- At least 20 address fixtures covering saved Home, no saved Home, duplicate labels, free-text address, invalid/unserviceable address, and location pin.

Keep paraphrases from the same conversation together in either training, development, or holdout data. Do not let near-duplicate examples appear in both training and evaluation sets.

### Phase 4: Human review rules

- A Lebanese native speaker reviews Arabizi and Arabic-script examples for naturalness and ambiguous wording.
- An operations reviewer verifies products, merchants, fees, zones, and order outcomes against test data.
- A safety reviewer verifies that no example teaches automatic confirmation, silent substitution, silent merchant switch, or default-address selection.
- Any real customer address or phone number must be redacted before entering training/evaluation data.

### Phase 5: Evaluation gates

Run a deterministic Gemini replay suite against recorded tool fixtures before deployment. A change cannot ship unless all P0 gates pass.

| Gate | Target |
|---|---:|
| No `*`, `#`, or lion emoji in any customer reply | 100% |
| Correct response category for all seven screenshot families | 100% |
| Address message routed to address flow, never catalog flow | 100% |
| No-active-order message routed to order-status flow, never catalog flow | 100% |
| Unclear message causes no mutation/order creation | 100% |
| Explicit confirmation required before every child order/batch order | 100% |
| Cross-merchant request preserves both item plans | 100% |
| Verified product/price/address/order facts only | 100% |
| Sender-language/script compliance on reviewed multilingual corpus | at least 98%, with all critical Arabic/Arabizi cases manually reviewed |
| Context retention across 10+ turns and service restart | 100% on gold scenarios |

## Required test conversations

These are the first acceptance fixtures to add after implementation. Customer-facing examples intentionally contain no Markdown markers or lion emoji.

### Test A: Unclear input

```text
State: IDLE
Customer: J
Expected intent: CLARIFICATION
Expected tool: none
Expected reply fact: asks what the customer wants to do
Forbidden: welcome script, catalog search, cart mutation, order creation
```

### Test B: Greeting keeps context

```text
State: SELECTING_OPTION
Last assistant question: What food and budget do you prefer?
Customer: Hello
Expected intent: CONTINUE_PENDING_TASK
Expected reply fact: brief greeting plus the food/budget question
Forbidden: fresh welcome, state reset, catalog miss
```

### Test C: Detailed address is captured

```text
State: SELECTING_ADDRESS with a non-empty Chicken House cart
Customer: Saida, Abra, [detailed directions]
Expected intent: CAPTURE_DELIVERY_ADDRESS
Expected tool: capture_delivery_address
Expected reply fact: address confirmation or request for location/landmark
Forbidden: search_catalog, product-miss text, order creation
```

### Test D: Two separate restaurant orders

```text
State: selected Chicken House item and selected Burger Spot item
Customer: Order from both places
Expected intent: CREATE_MULTI_ORDER_PLAN
Expected result: two preserved merchant child carts/order plans
Expected reply fact: separate orders, address decision, confirm both instruction
Forbidden: clear_cart, merchant-switch-only reply, automatic order creation
```

### Test E: Drink context and spelling

```text
State: EDITING_CART at Chicken House, pending product category beverage
Customer: Kinza
Expected intent: RESOLVE_PRODUCT_NAME
Expected tool: search catalog with aliases/spelling candidates in current merchant context
Expected reply fact: asks about a verified candidate or says the named drink is absent and offers verified choices
Forbidden: generic catalog-miss text without naming the requested drink, silent Coke substitution
```

### Test F: Arabic Home with no saved Home address

```text
State: SELECTING_ADDRESS
Customer: عالبيت
Expected intent: SELECT_SAVED_ADDRESS
Expected tool: list/find saved addresses
Expected reply fact: Home is not saved; offer add-address or location pin
Forbidden: search_catalog, automatic default address selection, order creation
```

### Test G: No active order

```text
State: IDLE, no active order in database
Customer: Where is my order?
Expected intent: ORDER_STATUS
Expected tool: get_order_status
Expected reply fact: no active order right now
Forbidden: search_catalog, catalog-miss text, invented ETA/order number
```

## Proposed implementation order

This section is intentionally a plan, not a code change.

### P0: Customer-visible correctness

1. Remove Markdown/heading/lion-emoji instructions and strings across prompt, response localizer, templates, and output validator.
2. Replace the global not-found override with structured error-to-response-category mapping.
3. Add direct coverage for unclear input, address miss, and no-active-order replies.
4. Make order tracking and pending address selection take priority over catalog search.

### P0: Context and address reliability

1. Persist a durable conversation summary, stage, and `next_required_action` by conversation ID.
2. Build Gemini input from current verified state plus the last relevant turns, not only a short cache history.
3. Add an address-draft capture/validation flow and remove default-address fallback on unmatched phrases.
4. Add conversation-level serialization/idempotency for rapidly arriving WhatsApp messages.

### P1: Product understanding

1. Add pending-category context for short follow-up product messages.
2. Implement catalog-backed alias, spelling-candidate, and current-merchant-first resolution.
3. Render verified alternatives only after a clear, non-silent product miss.
4. Build and review Lebanese Arabizi/Arabic product and drink examples from real inventory.

### P1: Separate multi-merchant orders

1. Add the order-batch model and independent merchant child carts.
2. Add Gemini tools for planning/reviewing/confirming a batch.
3. Build fee, address, payment, and partial-failure rules.
4. Add idempotency and end-to-end tests for two separate orders from one chat.

### P2: Production learning loop

1. Log anonymized, redacted Gemini plans, tool outcomes, response category, and customer follow-up outcome.
2. Flag corrections, repeated questions, failed address captures, and abandoned checkout flows for human review.
3. Add approved failures to the gold dataset each week and rerun the holdout suite before prompt/model changes.
4. Monitor response-category accuracy and language/style compliance in the demo dashboard without exposing customer addresses or sensitive text.

## Definition of done

- [x] Every customer-facing path is plain text with no `*`, `#`, or lion emoji.
- [x] An unintelligible message receives a concise, language-matched clarification instead of a generic welcome.
- [x] A greeting never resets an unfinished shopping/address/confirmation task.
- [x] Address-shaped text in an address stage never reaches catalog search.
- [x] Missing/invalid addresses receive address-specific help and an add-address/location option.
- [x] A Home phrase only selects a saved Home address; otherwise it asks to add one.
- [x] Product miss, cart miss, address miss, no active order, and unclear input each have distinct verified responses.
- [x] Vague/misspelled product requests use context, aliases, and verified alternatives without silent substitutions.
- [x] “Order from both places” creates two separate reviewable orders with separate totals and explicit batch confirmation.
- [x] “Where is my order?” with no active order says exactly that there is no active order right now.
- [x] The Gemini-only gold/evaluation suite passes all P0 gates before deployment.

## Files expected to change later

This is an implementation map only; none of these files are modified by the present planning task.

- `backend/src/modules/ai/prompts/gemini.system-prompt.ts`
- `backend/src/modules/ai/gemini.service.ts`
- `backend/src/modules/ai/interactive-not-found.ts`
- `backend/src/modules/ai/response-localizer.ts`
- `backend/src/modules/ai/state/ai-state.types.ts`
- `backend/src/modules/ai/contract/behavior.contract.ts`
- `backend/src/modules/ai/contract/tool-schemas.ts`
- `backend/src/modules/ai/tools/ai-tools.executor.ts`
- `backend/src/modules/customers/customer.service.ts`
- `backend/src/modules/carts/cart.service.ts`
- `backend/src/modules/orders/order.service.ts`
- `backend/src/modules/conversations/*`
- `datasets/v1/*` or a versioned successor dataset directory
- Gemini, conversation, address, catalog, order, and end-to-end test scripts

## Non-negotiable safety rules during implementation

- Do not let a stronger prompt bypass backend price, availability, address, or order validation.
- Do not call an order-creation tool from an unclear message, a greeting, a bare yes without matching context, or an unreviewed address.
- Do not silently change merchants, clear a cart, substitute a drink, or choose a default address.
- Do not put full customer addresses, phone numbers, or tokens into prompts, datasets, logs, screenshots, or review exports.
- Do not claim multi-merchant ordering is complete until independent orders, fees, confirmations, and failure recovery have been tested end to end.
