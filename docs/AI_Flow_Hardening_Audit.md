# Lion AI and WhatsApp Flow Hardening Audit

This audit covers the demo's real WhatsApp/Gemini path and the database-backed worker. It is separate from the frontend simulator.

## Runtime flow

1. Meta sends a signed webhook to `POST /webhooks/whatsapp`.
2. The controller verifies the signature, handles delivery receipts, extracts every message from every entry/change, and stores each event as `RECEIVED`.
3. The controller returns `200 EVENT_RECEIVED` immediately. `WhatsAppWorker` claims inbound events and processes them serially to preserve customer message order.
4. The processor normalizes text, interactive replies, voice notes, images, locations, and unsupported message types; it persists the inbound message exactly once.
5. `AIService` dispatches to Gemini when `AI_PROVIDER=gemini`. Gemini may call bounded server-side tools for catalog, cart, address, order, and status operations.
6. The worker stores the generated reply in `outbox_events`, marks the webhook event `PROCESSED`, then sends the reply through Meta Cloud API.
7. Successful outbound messages are persisted and delivery/read receipts update their status. Retryable failures use bounded backoff; permanent failures are recorded in `failed_jobs`.

## Gaps found and addressed

- Synchronous webhook processing could exceed Meta's response window while media or Gemini was running. The webhook is now acknowledge-first and worker-backed.
- Only the first entry/change/message was handled. The extractor now handles all entries, changes, messages, and statuses in a payload.
- Retries could duplicate inbound messages or AI replies. Provider IDs, a unique message key, integration-event deduplication, and an inbound reply outbox provide idempotency for normal retries.
- Gemini tool results used the unsupported `role: function`. They now use a single `role: user` turn with matching `functionResponse` parts and preserved call IDs.
- Multiple model function calls were not handled. All calls are returned together; conflicting mutations are rejected after the first mutation in a turn.
- Cart mutations accepted unsafe quantities, silently switched merchants, and could clear a cart from ambiguous intent. Quantity bounds, explicit destructive language, and merchant-switch confirmation are enforced server-side.
- Order confirmation could be triggered by substring matching. It now requires an exact confirmation phrase plus a previously selected address/final-summary state.
- Internal address IDs are no longer returned to Gemini.
- Operator replies now switch the conversation to `HUMAN` mode so the AI does not answer over a human agent.
- Outbound SENT/DELIVERED/READ/FAILED provider updates are persisted for the live inbox.
- Overnight operating hours now work across midnight instead of using a simple same-day `BETWEEN` check.

## Failure and retry behavior

- Gemini timeouts use `GEMINI_REQUEST_TIMEOUT_MS` and are retryable at the worker level.
- Gemini/Meta authentication, malformed input, expired messaging windows, and undeliverable recipients fail closed and do not create fake success.
- Rate limits, server errors, network errors, and database deadlocks are retryable up to `WHATSAPP_WORKER_MAX_RETRIES`.
- Stale `PROCESSING` claims are recovered after `WHATSAPP_WORKER_STALE_SECONDS`.
- The queue is intentionally database-backed and single-process for this demo. It is at-least-once around the small crash window between a tool side effect and outbox insertion; production scaling should add a transactional command/idempotency key per mutating tool.

## Demo boundaries and required production follow-up

- `MEDIA_MODE=FIXTURE` deliberately uses deterministic audio/image processing for the demo. The live WhatsApp transport is real, but production transcription and vision require the corresponding live providers and credentials.
- Meta test numbers and temporary access tokens have recipient, rate, and lifetime limits.
- Before production, add a controlled “resume AI” operator action, durable per-tool idempotency keys, monitoring/alerts for `failed_jobs`, and a multi-process queue strategy if more than one backend worker is deployed.

## Regression coverage

- `npm run test:gemini`: provider selection, Gemini tool loop, cart/address/order/status flows, Redis state, and HTTP error handling.
- `npm run test:ai-edgecases`: parallel function calls, call IDs, unsupported media, interactive messages, quantity bounds, destructive-action guards, merchant switching, and confirmation protection.
- `npm run test:webhook`: HMAC verification, replay deduplication, batched messages, voice/image paths, outbound delivery, and Meta receipt updates.
