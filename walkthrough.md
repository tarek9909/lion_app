# Lion Delivery Demo Readiness Walkthrough

Updated: 2026-09-15

## Readiness decision

All actionable in-repository findings from the Gemini completion-claim audit are implemented and covered by automated checks. The local customer demo is ready to rehearse in MOCK WhatsApp and FIXTURE media mode.

The following remain explicitly outside a local completion claim:

- Real Meta media download.
- Real Whisper transcription and live vision-provider output.
- Human approval of synthetic training examples.

The live Meta text/webhook path is separately verified on the demo server. The Meta test number still has Meta's normal allowlist restriction: only authorized test recipient numbers can receive test-account outbound messages.

## Start the demo

From the repository root:

```bash
npm install
npm --prefix backend install
npm --prefix dashboard install
npm run build
npm run demo:seed
npm run dev:backend
npm run dev:dashboard
```

Open `http://localhost:5173`. Use the dashboard simulator or the WhatsApp webhook path. The default local boundary is `WHATSAPP_MODE=MOCK` with `MEDIA_MODE=FIXTURE`.

## Customer conversation walkthrough

1. Search for a known item, such as `bade crispy chicken under 15$`.
2. Add a listed item and optionally provide a note, such as `add the first one without pickles`.
3. Select an address with `3al bet`.
4. Review the final summary, then explicitly send `confirm`.
5. Complete the order lifecycle from the dashboard.
6. Start a new shopping session after delivery; the prior order id is terminal and cannot block a new order.

### Catalog miss rule

When the requested item is absent from the current catalog, the assistant must say exactly:

> I couldn't find that within my current catalog. Do you want to choose another item or try a different name?

It must keep the conversation interactive, ask the actionable question, and never invent a nearby product or silently substitute an item.

### Understandability rule

When the message is unclear, incomplete, contradictory, or not understandable, the assistant must ask a short clarification question with examples. It must not guess, mutate the cart, select an address, or create an order from an unclear message.

### Sender-language rule

The assistant detects the language of the latest sender message on every turn and replies in that language, including its script. English, Arabic script, Lebanese Arabizi, French, Spanish, German, Italian, Portuguese, Turkish, and common non-Latin scripts are covered by the language policy. Mixed Arabic/Latin messages receive a natural mixed-style reply. A stored customer preference never overrides the language of the current message.

### Response-speed rule

Production uses Gemini as the only AI provider. Routine Gemini replies are capped at a concise 600-token budget, read-only tool calls avoid creating/loading a cart row until needed, and post-response state, history, telemetry, and cart work runs concurrently. This keeps the customer-facing path responsive without bypassing grounding, confirmation, or mutation safety.

## Verification checklist

Run from the repository root:

| Check | Command | Verified result |
|---|---|---|
| Production build | `npm run build` | Backend and dashboard build passed |
| AI contract and schemas | `npm --prefix backend run test:contract` | Passed |
| Dataset JSON Schema and provenance validation | `npm --prefix backend run test:datasets` | Passed |
| Deterministic evaluator | `npm --prefix backend run test:eval` | Passed; 23 records, 100% deterministic metrics |
| Evaluator exact typing and order idempotency | `npm --prefix backend run test:evaluator-safety` | Passed |
| Catalog retrieval and basket comparison | `npm --prefix backend run test:search-quality` | Passed; no duplicate results, basket cases complete |
| Not-found and unclear-message behavior | `npm --prefix backend run test:not-found` | Passed |
| Sender-language detection and response consistency | `npm --prefix backend run test:language` | Passed; English, Arabic, Arabizi, mixed, French, and additional language/script profiles |
| Gemini-only production routing and response budget | `npm --prefix backend run test:config-matrix` | Passed; Smart NLU rejected in production and routing matrix remains covered |
| Shadow zero-mutation boundary | `npm --prefix backend run test:shadow-immutability` | Passed |
| Telemetry redaction and Gemini HTTP failure telemetry | `npm --prefix backend run test:telemetry` | Passed |
| Provider/routing configuration matrix | `npm --prefix backend run test:config-matrix` | Passed |
| AI edge-case regression suite | `npm --prefix backend run test:ai-edgecases` | Passed; 31/31 |
| Full HTTP/WebSocket rehearsal | `npm --prefix backend run test:rehearsal` | Passed; 3 consecutive runs |
| AI training and audit runner | `npm --prefix backend run test:ai-plan` | Passed; 12/12 suites in disposable MySQL and Redis DB 15 |
| Full integration runner | `npm --prefix backend run test:all` | Passed; 15/15 suites in disposable MySQL and Redis DB 15 |

Both master runners create a validated disposable database named `lion_delivery_test_<pid>_<timestamp>`, use Redis DB 15, seed it, and remove it in `finally`. They do not use or leave customer data in the shared demo database.

## Evidence map

- Checkout/state safety: `backend/src/modules/ai/checkout-safety.ts`, `backend/src/modules/ai/ai.service.ts`, `backend/src/modules/ai/tools/ai-tools.executor.ts`.
- Interactive miss and clarification contract: `backend/src/modules/ai/interactive-not-found.ts`, `backend/src/modules/ai/prompts/gemini.system-prompt.ts`, `backend/src/scripts/test-interactive-not-found.ts`.
- Sender-language policy and deterministic response localization: `backend/src/modules/ai/sender-language.ts`, `backend/src/modules/ai/response-localizer.ts`, `backend/src/scripts/test-language-consistency.ts`.
- Shadow telemetry and failure capture: `backend/src/modules/ai/routing/shadow-canary.service.ts`, `backend/src/modules/ai/gemini.service.ts`.
- Isolated master runners: `backend/src/scripts/test-isolation.ts`, `backend/src/scripts/test-ai-plan.ts`, `backend/src/scripts/test-all.ts`.
- Dataset/evaluator hardening: `backend/src/modules/ai/dataset/dataset-validator.ts`, `backend/src/modules/ai/evaluation/evaluator.ts`, `backend/src/modules/ai/evaluation/evaluator-tool-adapter.ts`.

## External verification handoff

The deployed server verification on 2026-09-15 confirmed HTTP 200 health with MySQL and Redis up, successful webhook verification, the configured Meta phone ID and WABA subscription, inbound events marked `PROCESSED`, and outbound bot replies marked `SENT`/`DELIVERED`/`READ`.

For a Meta test-number inbound rehearsal, add the tester's WhatsApp number to Meta's authorized test recipients and send a normal WhatsApp message to the test number. The Meta dashboard's **Send a message** control is outbound-only; it cannot create the inbound customer event. Error `131030` means the recipient is not authorized by Meta and must be added in Meta before Lion can deliver a reply.

Real Meta media download, real Whisper transcription, live vision-provider output, and human approval of synthetic training examples remain separate provider-verification tasks.
