# Lion Delivery Demo Readiness Walkthrough

Updated: 2026-09-15

## Readiness decision

All actionable in-repository findings from the Gemini completion-claim audit are implemented and covered by automated checks. The local customer demo is ready to rehearse in MOCK WhatsApp and FIXTURE media mode.

The following remain explicitly outside a local completion claim:

- Real Meta WhatsApp delivery and receipt on a physical test number.
- Real Meta media download.
- Real Whisper transcription and live vision-provider output.
- Human approval of synthetic training examples.

These boundaries are documented as pending; they are not counted as passing evidence.

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
| Shadow zero-mutation boundary | `npm --prefix backend run test:shadow-immutability` | Passed |
| Telemetry redaction and Gemini HTTP failure telemetry | `npm --prefix backend run test:telemetry` | Passed |
| Provider/routing configuration matrix | `npm --prefix backend run test:config-matrix` | Passed |
| AI edge-case regression suite | `npm --prefix backend run test:ai-edgecases` | Passed; 31/31 |
| Full HTTP/WebSocket rehearsal | `npm --prefix backend run test:rehearsal` | Passed; 3 consecutive runs |
| AI training and audit runner | `npm --prefix backend run test:ai-plan` | Passed; 11/11 suites in disposable MySQL and Redis DB 15 |
| Full integration runner | `npm --prefix backend run test:all` | Passed; 14/14 suites in disposable MySQL and Redis DB 15 |

Both master runners create a validated disposable database named `lion_delivery_test_<pid>_<timestamp>`, use Redis DB 15, seed it, and remove it in `finally`. They do not use or leave customer data in the shared demo database.

## Evidence map

- Checkout/state safety: `backend/src/modules/ai/checkout-safety.ts`, `backend/src/modules/ai/ai.service.ts`, `backend/src/modules/ai/tools/ai-tools.executor.ts`.
- Interactive miss and clarification contract: `backend/src/modules/ai/interactive-not-found.ts`, `backend/src/modules/ai/prompts/gemini.system-prompt.ts`, `backend/src/scripts/test-interactive-not-found.ts`.
- Shadow telemetry and failure capture: `backend/src/modules/ai/routing/shadow-canary.service.ts`, `backend/src/modules/ai/gemini.service.ts`.
- Isolated master runners: `backend/src/scripts/test-isolation.ts`, `backend/src/scripts/test-ai-plan.ts`, `backend/src/scripts/test-all.ts`.
- Dataset/evaluator hardening: `backend/src/modules/ai/dataset/dataset-validator.ts`, `backend/src/modules/ai/evaluation/evaluator.ts`, `backend/src/modules/ai/evaluation/evaluator-tool-adapter.ts`.

## External verification handoff

Before claiming full provider verification, set real non-placeholder credentials in a secure environment and run the live Meta, Whisper, vision, and Gemini rehearsals with real fixtures. Record receipt IDs, provider response metadata, acoustic WER, image matching results, and human review approval separately from the local results above.
