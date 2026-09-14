# Gemini 3.8 Flash + Live WhatsApp Integration

## Current project status

The project currently uses a local deterministic chatbot:

```env
AI_PROVIDER=smart_nlu
AI_API_KEY=
```

The text chatbot is implemented in `backend/src/modules/ai/ai.service.ts`. It does not currently call Gemini, OpenAI, or another external text model.

WhatsApp webhook handling and Meta Cloud API outbound delivery already exist, but the local environment is configured for simulation:

```env
WHATSAPP_MODE=MOCK
MEDIA_MODE=FIXTURE
```

Therefore, environment-variable changes alone will not make Gemini work. A Gemini provider and controlled tool-calling layer must be added.

## Target configuration

The target chatbot should use Google Gemini 3.8 Flash with the official model identifier `gemini-3.8-flash`.

Official references:

- [Gemini 3.8 Flash model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Gemini API key documentation](https://ai.google.dev/gemini-api/docs/api-key)

## Required credentials

Never commit real values to the repository. Put them in `backend/.env` or the deployment secret manager.

```env
# Meta WhatsApp Cloud API
WHATSAPP_MODE=LIVE
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp phone number ID>
WHATSAPP_ACCESS_TOKEN=<Meta WhatsApp Cloud API access token>
WHATSAPP_APP_SECRET=<Meta app secret>
WHATSAPP_VERIFY_TOKEN=<private webhook verification string>

# Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=<Google AI Studio API key>
GEMINI_MODEL=gemini-3.8-flash
```

The backend also still requires its local infrastructure:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<local MySQL password>
DB_NAME=lion_delivery
REDIS_URL=redis://127.0.0.1:6379
```

The webhook must be publicly reachable over HTTPS. Configure Meta with:

```text
https://<public-host>/webhooks/whatsapp
```

Use the same `WHATSAPP_VERIFY_TOKEN` in Meta webhook configuration and the backend environment.

## Required implementation changes

### 1. Gemini configuration

Update `backend/src/config/env.ts` to support:

- `AI_PROVIDER=smart_nlu|gemini`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`, defaulting to `gemini-3.8-flash`

When `AI_PROVIDER=gemini`, fail clearly at startup if the Gemini key is missing. Do not silently fall back to the local chatbot in live Gemini mode.

Keep `smart_nlu` available as the default local/offline fallback so existing tests and demos remain usable without external credentials.

### 2. Gemini provider

Add a dedicated Gemini provider, preferably in a new file such as:

```text
backend/src/modules/ai/gemini.service.ts
```

Use the official Google GenAI SDK or the official Gemini REST API. Keep the Gemini API key server-side; never expose it to the dashboard or browser.

The provider must return the existing `AIProcessResult` shape or a compatible adapter so the current conversation controller continues to work.

### 3. Controlled autonomous tools

Gemini must not receive direct database access. Expose only server-side function/tool declarations backed by existing services:

- Search the active catalog
- Compare products or supermarkets
- Add an item to the customer cart
- Update quantity
- Update product variant/size
- Add product notes or modifications
- Remove an item
- Clear the cart
- List saved customer addresses
- Select a delivery address
- Show the active cart
- Check active order status
- Confirm and create an order
- Request human support

Use the existing services where possible:

- `catalogService`
- `cartService`
- `customerService`
- `orderService`

The model may perform catalog searches and cart changes autonomously, but order creation must require an explicit customer confirmation.

### 4. Conversation context

Send Gemini only the context required for the current customer conversation:

- Recent inbound and outbound messages
- Current Redis AI state
- Current cart and totals
- Saved delivery addresses
- Catalog/search results returned by tools
- Active order status when relevant

Limit history and tool rounds to keep WhatsApp responses fast and API costs controlled. Use a clear maximum tool-call loop and return a safe error if the limit is reached.

### 5. Prompt and response behavior

The system instruction should tell Gemini to:

- Act as Lion Delivery's ordering assistant
- Support English, Arabic, and Lebanese Arabizi
- Use tools for live catalog, price, cart, address, and order information
- Never invent products, prices, availability, addresses, order numbers, or delivery states
- Ask a clarification question when a cart target is ambiguous
- Show the final order summary before confirmation
- Create an order only after explicit confirmation
- Keep messages concise and WhatsApp-friendly
- Never reveal internal database IDs, API keys, or system details

Use low randomness for transactional behavior and a bounded output size. Validate every tool argument on the server before execution.

### 6. Live WhatsApp path

The existing flow in `backend/src/modules/conversations/conversation.controller.ts` already follows the correct high-level path:

```text
Meta inbound webhook
        -> AI provider
        -> persist conversation/order state
        -> Meta Cloud API outbound reply
```

Verify that live outbound failures are persisted as failed, that webhook processing is marked failed when appropriate, and that errors do not get reported as successful delivery.

Keep `backend/src/modules/whatsapp/whatsapp.service.ts` as the Meta transport boundary.

### 7. Media behavior

The current audio and image providers are OpenAI-based and are separate from the text chatbot. Do not replace them as part of the first Gemini text integration unless explicitly required.

If Gemini media processing is added later, implement it as a separate provider choice and preserve explicit `FIXTURE` and `LIVE` modes.

## Likely files to change

- `backend/src/config/env.ts`
- `backend/src/modules/ai/ai.service.ts`
- New `backend/src/modules/ai/gemini.service.ts`
- `backend/.env.example`
- `backend/src/modules/conversations/conversation.controller.ts` if error handling needs tightening
- `backend/src/modules/whatsapp/whatsapp.service.ts` if live delivery reporting needs tightening
- New or updated Gemini integration tests

Do not modify or commit real credentials in `.env` files.

## Acceptance criteria

The implementation is complete only when all of the following are true:

1. `AI_PROVIDER=smart_nlu` continues to work without Gemini credentials.
2. `AI_PROVIDER=gemini` uses model `gemini-3.8-flash`.
3. Missing Gemini credentials fail clearly in Gemini mode.
4. A WhatsApp text message reaches the Gemini provider through the existing webhook.
5. Gemini can search the real catalog and report real prices and availability.
6. Gemini can add and modify cart items through validated server tools.
7. Gemini asks for clarification instead of guessing when an item target is ambiguous.
8. Gemini cannot create an order without explicit confirmation.
9. A confirmed order is created through `orderService.createOrderFromCart` and appears in the dashboard.
10. The reply is sent through Meta Cloud API in `WHATSAPP_MODE=LIVE`.
11. Meta and Gemini API failures are logged and persisted safely without fake success responses.
12. Existing local tests and the fixture demo still pass.
13. No API key, access token, app secret, or database password appears in source code, logs, screenshots, or committed files.

## Kickoff message for Antigravity

Copy and send the message below:

```text
Please inspect and implement the Lion Delivery Gemini 3.8 Flash live WhatsApp integration described in:

docs/Gemini_WhatsApp_Integration_Kickoff.md

Important requirements:

1. Do not commit, print, or expose real credentials. Use environment variables only.
2. Preserve the existing smart_nlu provider and all MOCK/FIXTURE behavior for offline demos and tests.
3. Add an opt-in Gemini provider selected by AI_PROVIDER=gemini.
4. Use the official Gemini model identifier gemini-3.8-flash.
5. Add GEMINI_API_KEY and GEMINI_MODEL configuration with clear validation.
6. Keep the Gemini key server-side; it must never reach the dashboard/browser.
7. Use controlled function/tool calling backed by the existing catalogService, cartService, customerService, and orderService. Gemini must not access MySQL or Redis directly.
8. Support catalog search, product selection, cart changes, address selection, order status, and explicit order confirmation.
9. Require an explicit customer confirmation before calling orderService.createOrderFromCart.
10. Preserve conversation state and recent history across WhatsApp messages.
11. Keep replies concise and support English, Arabic, and Lebanese Arabizi.
12. Never invent prices, products, availability, addresses, order numbers, or delivery status.
13. Keep the existing Meta WhatsApp transport boundary and live webhook routes. Verify that live outbound failures are not reported as successful.
14. Do not replace the existing OpenAI media providers in this first phase unless necessary.
15. Add tests for provider selection, missing-key validation, tool execution, confirmation protection, and Gemini failure handling.
16. Run the TypeScript build and the existing local test suite. Report exactly what passed and what still requires live Meta/Gemini credentials.

Before editing, summarize the files you will change and the integration design. Then implement the changes and provide the final environment-variable checklist.
```
