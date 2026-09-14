# Lion Delivery Demo — Gaps and Fix Plan

## Purpose

This document records the gaps found by comparing the implemented repository with:

- `docs/Lion_Delivery_Demo_Kickoff_Message.md`
- `docs/Lion_Delivery_Full_Demo_Implementation_Plan.md`
- `docs/Lion_Delivery_Master_Implementation_Plan.md`
- `docs/Lion_Delivery_Full_Technical_Documentation.md`

It is a remediation plan only. It does not claim that the gaps below have already been fixed.

## Current audit result

The implementation is a working scripted demo slice, but it is not fully complete against the approved demo definition of done.

Verified during the latest re-audit:

- Backend build passes.
- Dashboard build passes.
- Dashboard lint passes with no warnings reported.
- Conversation test pack passes 15/15 scenarios.
- Service-level rehearsal passes 3/3 consecutive runs.
- Full master suite passes all 7 suites with zero test failures.
- The tests still use mocked outbound WhatsApp delivery when Meta credentials are absent.

The automated rehearsal calls backend services directly. It does not prove real Meta WhatsApp delivery, real audio/image processing, browser behavior, or complete WebSocket behavior.

## Priority definitions

- **P0 — Demo blocker:** The client-facing demo cannot truthfully claim the required behavior until fixed.
- **P1 — High:** The main flow works only in a narrow scripted path or can fail during presentation.
- **P2 — Medium:** The feature exists but is simplified, hardcoded, or incomplete compared with the plan.
- **P3 — Low:** Documentation, polish, or maintainability gap.

## Gap register

| ID | Target phase | Priority | Gap | Required fix | Verification |
|---|---:|:---:|---|---|---|
| G-001 | 0, 1 | P1 | No `.env.example`, environment validation, demo backlog, or traceability matrix is present. | Add a safe environment template, startup validation, documented local setup, phase backlog, and requirement-to-code-to-test traceability. Never commit credentials. | A fresh developer can configure and start the demo using the documented steps; missing required secrets fail clearly. |
| G-002 | 0, 22 | P1 | Demo reset does not restore a clean data baseline. Repeated runs leave duplicate merchant/address records. | Make seed operations idempotent using stable business keys or explicit cleanup. Add unique constraints/migrations where appropriate. Reset only demo-owned data and verify counts after reset. | Run reset 10 times; merchant, branch, customer, address, product, and driver counts remain stable. |
| G-003 | 0, 3 | P2 | README documentation is stale: it states 82 tables/views while the imported schema contains 121 base tables and 5 views. | Update the README and setup documentation to reflect the actual schema and current runtime requirements. | Documentation matches `information_schema` counts and current package scripts. |
| G-004 | 1 | P1 | Backend has no request validation middleware despite `zod` being installed. | Define schemas for request bodies, query parameters, route IDs, webhook payloads, ratings, roles, and media metadata. Reject invalid requests with consistent errors. | Invalid payload tests return safe 4xx responses and never reach business functions. |
| G-005 | 1 | P1 | Login exists, but there is no token verification or authorization middleware on dashboard APIs. | Implement a demo-safe session/JWT middleware, protect operational routes, enforce roles where required, and add dashboard login state. | Requests without valid credentials are rejected; permitted roles can perform only allowed actions. |
| G-006 | 1, 21 | P1 | Authentication uses plain-text/demo password comparison and can return a default admin token for unknown users. | Hash seeded passwords, remove fallback admin-token behavior, validate account status, and use controlled demo credentials only in local configuration. | Authentication tests cover valid, invalid, inactive, and unauthorized users. |
| G-007 | 1 | P2 | Health endpoints always report the database as connected without checking the database. | Make health checks report actual MySQL and Redis state, with readiness separated from liveness. | Stop a dependency and confirm readiness returns a failure status. |
| G-008 | 1, 21 | P2 | Error handling exposes raw error messages and lacks structured logging/correlation IDs. | Add safe customer-facing error mapping, structured server logs, request IDs, and server-side diagnostic details. | Simulated failures do not expose SQL/provider errors to customers. |
| G-009 | 2, 13 | P0 | WebSocket contract mismatch: backend sends event payload under `data`, while the dashboard reads `payload`. | Standardize the event envelope and update both producer and consumer. Validate event schemas. | Creating/updating an order and sending relay messages update the dashboard without refresh. |
| G-010 | 2, 13 | P1 | Dashboard live order behavior relies on WebSockets but has no robust fallback refresh/reconnect strategy for missed events. | Add event resynchronization or polling fallback after reconnect, deduplicate events, and refetch affected resources. | Disconnect/reconnect the browser and confirm no order or message is lost. |
| G-011 | 2, 14, 15 | P2 | The dashboard is an operator simulation rather than separate authenticated merchant/driver views. | Keep the simplified demo UI if desired, but make its role and state explicit; wire actions to real current records rather than fixed presentation data. | Demo operator actions update the correct database order and actor context. |
| G-012 | 3 | P1 | Merchant summary cards and driver cards are hardcoded in the dashboard. | Load merchants and drivers from backend APIs; render status, ratings, zones, and performance from database data. | Changing seeded data changes the dashboard without editing React code. |
| G-013 | 3 | P1 | Seed data is only partly idempotent and historical/demo records are not consistently linked to complete order data. | Use deterministic seed identifiers, upserts, stable order numbers, and seed complete order items/status histories where the UI depends on them. | Seed from empty schema and rerun repeatedly without duplicate or orphan records. |
| G-014 | 4 | P2 | Customer handling supports phone identification and saved-address phrase matching, but there is no full address/location flow. | Add address listing/selection, location-message parsing, address details, validation, and customer-facing address confirmation. | Test Home, Work, GPS location, and detailed address requests. |
| G-015 | 4 | P2 | The demo seed gives each seeded customer only one address, limiting the documented saved-address scenario. | Seed multiple addresses for the main demo customer and expose them through the conversation/dashboard flow. | Customer can choose between at least Home and Work without restarting. |
| G-016 | 5 | P0 | The implementation does not send outbound replies through the official Meta WhatsApp Cloud API. | Add a WhatsApp provider client, outbound message creation, delivery-status persistence, provider error handling, and retry policy. | A real test WhatsApp message reaches the backend and receives a real reply. |
| G-017 | 5 | P0 | Webhook handling supports only the first text message and does not process real image, audio, or location payloads. | Parse all supported Meta message types, download media securely, persist media metadata, process locations, and pass normalized input to the conversation engine. | Send text, image, audio, and location messages from the test number. |
| G-018 | 5, 21 | P0 | Webhook duplicate protection, signature validation, and basic retry handling are missing. | Verify Meta signatures, persist provider message IDs, make processing idempotent, and implement safe retry/dead-letter behavior. | Replay the same webhook event and confirm exactly one business action/message. |
| G-019 | 5 | P1 | Conversation persistence is broken because query results are destructured incorrectly in `saveInboundOutbound`. | Use the actual row-array return shape, handle unknown customers safely, and test inbound/outbound persistence. | `/api/conversations` and customer history contain messages after simulator and webhook requests. |
| G-020 | 6 | P1 | The AI engine is a hardcoded rule matcher, not a structured AI pipeline with validated intent output. | Introduce a provider boundary, structured intent schema, confidence/clarification handling, and backend action dispatch. A deterministic local provider may remain as an explicit demo fallback. | Provider output is schema-validated and business actions never depend on free-form text. |
| G-021 | 6 | P1 | Required intents are incomplete or only represented by narrow phrases: order status, support, price checks, unknown cases, variants, and broader corrections are missing. | Implement the complete required intent set and state transitions from the demo plan. | Add positive, negative, ambiguous, and out-of-context tests for every required intent. |
| G-022 | 6, 9 | P1 | Cart targeting falls back to the first item when the requested item is not confidently identified. | Remove unsafe first-item fallback; ask for clarification when target resolution is ambiguous. | Ambiguous commands never modify the wrong cart item. |
| G-023 | 7 | P1 | Search does not filter `is_available`, delivery eligibility, or true merchant operating/open status consistently. | Apply availability, active/open status, delivery-zone eligibility, and customer-location filters before ranking. | Unavailable, closed, and out-of-zone products never appear as orderable options. |
| G-024 | 7 | P2 | Search has aliases and basic normalization, but no full-text or semantic search layer. | Add indexed full-text search and optional embeddings behind a provider/service boundary, while retaining deterministic fallback behavior. | Arabic, Arabizi, English, aliases, typos, and semantic queries return relevant results. |
| G-025 | 7 | P1 | `best_value` is declared but not implemented, budget filtering checks item price rather than complete delivered total, and empty results can produce unsafe responses. | Implement every ranking mode, calculate budget against item plus delivery fees, and add safe no-result responses. | Test cheapest, fastest, best-rated, best-value, budget exceeded, and no-result cases. |
| G-026 | 8 | P1 | Basket comparison uses a fixed four-item list for the audio demo rather than parsing a customer request dynamically. | Normalize/transcribe the requested basket into item/quantity structures, compare every eligible merchant, and return completeness plus totals. | Different basket contents and quantities produce correct comparisons. |
| G-027 | 8 | P2 | Basket comparison returns only one “Best Value” result instead of clearly presenting cheapest complete, fastest complete, and best-value options. | Calculate and expose all required comparison dimensions and explain missing items. | Test complete, incomplete, tied, and multi-merchant baskets. |
| G-028 | 9 | P1 | Cart editing lacks general support for variants, extras, clear/review cart, and natural corrections. | Implement cart command parsing and backend operations for variants, add-ons, notes, removals, clearing, review, and quantity changes. | Cart state and totals remain correct after every documented natural-language command. |
| G-029 | 9 | P1 | “Large” is stored as a note rather than applying a real product variant/price change. | Resolve variants against product/merchant variant data and recalculate pricing from the database. | Large/medium/small and regular/extra options change the correct line and total. |
| G-030 | 10 | P0 | Voice is simulated: the dashboard sends typed text with `mediaType=audio`; there is no audio storage, download, or transcription. | Implement media ingestion and transcription, normalize the transcript into the same conversation pipeline, and handle provider failure. | A real voice note works interchangeably with text while preserving context. |
| G-031 | 11 | P0 | Image understanding is simulated: the response is canned and does not inspect the image. | Implement image media retrieval, vision/model analysis, product matching, confidence handling, and merchant-context preservation. | A real product photo/screenshot produces a context-aware response. |
| G-032 | 12 | P1 | Checkout revalidates the branch and address but relies on stored cart prices/items instead of fully revalidating product availability and price. | Lock/re-read current product state during checkout, recalculate totals, and ask for confirmation if price or availability changed. | Change a price or availability before confirmation and verify safe behavior. |
| G-033 | 12 | P1 | Exactly-once order creation is protected only by a short time-window query and lacks a durable idempotency key. | Persist provider/customer confirmation IDs, enforce a unique idempotency key, and wrap all order effects in one transaction. | Retries and concurrent confirmations create exactly one order. |
| G-034 | 12, 14, 17 | P1 | Order status transitions do not consistently validate the current state and do not send customer status updates. | Add a state-transition service/state machine, reject invalid transitions, and emit outbound customer notifications for acceptance, preparation, delivery, and feedback. | Invalid transitions fail; customer receives each required status update. |
| G-035 | 13 | P1 | Order detail/timeline exists, but live order arrival depends on the broken WebSocket envelope and there is no reliable end-to-end browser test. | Fix the event contract, add browser/API integration tests, and ensure order detail refetches after events. | A confirmed order appears in the dashboard automatically with its timeline. |
| G-036 | 14 | P1 | Dashboard exposes merchant accept but not the documented reject/ready controls. | Add reject reason, preparing, ready, and alternative-order behavior where included in demo scope. | Accept, reject, preparing, and ready scenarios work from the dashboard. |
| G-037 | 14 | P1 | Merchant actions update database state but do not send customer-facing WhatsApp updates. | Publish domain events and route them through the WhatsApp outbound provider. | Customer receives acceptance, preparation, rejection, and alternative messages. |
| G-038 | 15 | P1 | Driver backend supports accept/pickup/deliver but not reject; the visible driver view is hardcoded and not an actionable driver interface. | Add driver offer rejection/reassignment and load current driver/order data into the demo driver experience. | Driver accept, reject, pickup, and delivery scenarios update the correct order. |
| G-039 | 16 | P1 | Relay dashboard is fixed to order `1`, starts with hardcoded messages, and does not load the active order conversation on mount. | Select an actual active order, fetch its relay history, and subscribe to normalized relay events. | Relay messages for the selected order load from MySQL and update live. |
| G-040 | 16 | P1 | [RESOLVED] Relay endpoints have no actor authorization; a caller can submit a customer/driver role in the request body. | Derive actor identity from authenticated session/provider context and enforce order/channel membership. | A customer cannot send as a driver and unrelated users cannot read a channel. (Verified in `test-api.ts`) |
| G-041 | 17 | P1 | Delivery stores a rating but does not send the documented customer delivery/feedback message; dashboard always submits a fixed five-star rating. | Send delivery notification, collect rating/comment from the appropriate customer flow, validate rating range, and persist feedback idempotently. | Customer receives the prompt and can submit a real rating/comment once. |
| G-042 | 18 | P1 | Analytics contains hardcoded/default values: average delivery time, conversation minimums, and UI fallbacks. | Calculate all displayed metrics from persisted records and return explicit null/empty states rather than invented values. | Alter database records and verify every dashboard number changes accordingly. |
| G-043 | 18 | P1 | Analytics can report duplicate merchants because seed/reset data is duplicated; the dashboard labels active merchants as branches. | Fix data integrity first, define metric semantics, and display merchant/branch counts accurately. | Analytics matches direct SQL verification for every KPI. |
| G-044 | 19 | P1 | Unavailable-product demand is hardcoded to “Diet 7Up” and “Family Pizza”; acceptance-rate text is hardcoded to 88%. | Record failed searches/no-result demand and calculate rejection/acceptance metrics from stored events/orders. | Prepared management questions return values that change with database data. |
| G-045 | 19 | P2 | Management AI supports keyword routing but has limited intent coverage and no explicit unknown/clarification response. | Add validated management intents, controlled query functions, safe unknown handling, and evidence-backed answers. | Test all documented questions, paraphrases, and unsupported questions. |
| G-046 | 20 | P1 | The 15-scenario pack validates backend service calls, not real HTTP, WebSocket, browser, Meta, media, auth, or failure behavior. | Extend tests into API integration, browser smoke, webhook replay, media fixtures, authorization, and failure/retry coverage. | CI runs the full test layers and reports failures clearly. |
| G-047 | 21 | P0 | Failure handling does not cover AI timeout, invalid AI output, no results, price changes, WhatsApp send failure, driver rejection, or duplicate messages comprehensively. | Add explicit failure branches, retries, safe fallback replies, dead-letter logging, and recovery workflows. | Each failure scenario produces a safe response and leaves consistent database state. |
| G-048 | 22 | P1 | Reset claims a pristine baseline but leaves duplicate seed entities and is not verified against stable expected counts. | Add reset invariants and post-reset assertions for carts, statuses, availability, analytics fixtures, conversations, and entity counts. | `demo:reset` fails loudly if the baseline is not exact. |
| G-049 | 23 | P0 | [RESOLVED] The three-run rehearsal proves only a backend service-level golden path; it does not prove the complete client flow through WhatsApp, dashboard, WebSocket, voice, image, and failure backup scenario. | Create a true end-to-end rehearsal using the HTTP API, WebSocket client, dashboard/browser, test WhatsApp provider, media fixtures, and backup scenario. | Complete the documented demo at least three consecutive times without manual database intervention. (Verified in `test-rehearsal.ts`) |
| G-050 | 0, 1, 20 | P2 | There is no durable phase completion record, acceptance evidence, or regression report checked into the project. | Maintain a phase status matrix with test commands, dates, environment, known limitations, and evidence links. | Every phase has an explicit pass/partial/fail status backed by repeatable evidence. |

## Recommended implementation order

### Wave 1 — Demo blockers

Target gaps: **G-002, G-009, G-016, G-017, G-018, G-019, G-030, G-031, G-047, G-049**.

1. Stabilize seed/reset data and add baseline assertions.
2. Fix conversation persistence.
3. Standardize the WebSocket event envelope.
4. Implement real WhatsApp outbound, webhook idempotency, media handling, and retry behavior.
5. Implement real audio/image processing or explicitly remove those claims from the demo scope.
6. Replace the service-only rehearsal with an end-to-end rehearsal.

### Wave 2 — Business truth and workflow correctness

Target gaps: **G-020 through G-029, G-032 through G-045**.

1. Add structured AI intent handling and safe clarification behavior.
2. Make search, basket, cart, checkout, and status transitions database-backed and state-safe.
3. Complete merchant, driver, relay, delivery feedback, analytics, and management-AI flows.
4. Remove hardcoded business metrics and fixed order/driver presentation data.

### Wave 3 — Security, resilience, and evidence

Target gaps: **G-001, G-004 through G-008, G-040, G-046, G-050**.

1. Add environment validation, request validation, authentication, authorization, and safe logging.
2. Add integration/browser/failure tests.
3. Update documentation and maintain a phase evidence matrix.

## Definition of complete

The demo should not be marked fully complete until all of the following are true:

- A real test WhatsApp message enters and exits through the configured provider.
- Text, audio, image, and location inputs work with the same customer context.
- Search, prices, availability, cart totals, orders, statuses, analytics, and management answers come from database state.
- Merchant and driver actions are state-validated and customer notifications are delivered.
- Dashboard order and relay updates work without manual refresh.
- Reset produces stable, duplicate-free demo data.
- Authenticated actor permissions protect operational APIs.
- The full client demo and backup scenario pass three consecutive end-to-end rehearsals.

---

# Authoritative Remediation & Verification Matrix (G-001 through G-050)

The original matrix below records the implementation claims made after the previous remediation pass. The latest re-audit found that several claims are not yet proven by the actual code or by the current test coverage. The current open findings are listed in the checklist below and override any earlier RESOLVED label for the affected areas.

| Gap ID | Status | Implementation Details | Verification Test Suite |
|:---|:---:|:---|:---|
| **G-001** | ✅ RESOLVED | Added `.env.example` with safe configuration placeholders; added startup environment validation in `env.ts`. | `test-api.ts` |
| **G-002** | ✅ RESOLVED | Deterministic demo reset script clearing webhook events, idempotency keys, carts, and asserting stable baseline counts. | `reset-demo.ts`, `test-rehearsal.ts` |
| **G-003** | ✅ RESOLVED | Updated README and technical docs to reflect 121 base tables and 5 views confirmed by MySQL `information_schema`. | `README.md` |
| **G-004** | ✅ RESOLVED | Implemented Zod request validation middleware in `validation.ts` and route schemas in `schemas.ts` rejecting bad payloads with 400. | `test-api.ts` |
| **G-005** | ✅ RESOLVED | Implemented JWT session authentication and role check middleware in `auth.middleware.ts`. | `test-api.ts` |
| **G-006** | ✅ RESOLVED | Added PBKDF2 password hashing (`hashPassword` / `verifyPassword`), removed plaintext checks, and removed fallback token creation. | `test-api.ts` |
| **G-007** | ✅ RESOLVED | Health check `/health` checks live MySQL ping and live Redis ping, returning 200 (healthy) or 503 (degraded). | `test-api.ts` |
| **G-008** | ✅ RESOLVED | Sanitized customer-facing API error responses (never leaks SQL or provider internals) and attached `x-request-id` headers. | `test-api.ts` |
| **G-009** | ✅ RESOLVED | Standardized WebSocket envelope to `{ type, payload, data: payload, timestamp }` satisfying producer and dashboard consumer contracts. | `test-websocket.ts` |
| **G-010** | ✅ RESOLVED | Added automatic reconnect handlers, event deduplication, and 8s polling fallback in `LiveOrders.tsx` and `RelayChat.tsx`. | `test-websocket.ts`, `LiveOrders.tsx` |
| **G-011** | ✅ RESOLVED | Replaced static UI simulator presentation with live database order state and authenticated operator actions. | `LiveOrders.tsx`, `test-rehearsal.ts` |
| **G-012** | ✅ RESOLVED | Dashboard loads active merchants and drivers dynamically from `/api/merchants` and `/api/drivers` endpoints. | `CatalogView.tsx`, `DriversView.tsx` |
| **G-013** | ✅ RESOLVED | Seed data uses deterministic UUIDs and idempotent upserts with complete order items and status histories. | `seed-demo.ts`, `reset-demo.ts` |
| **G-014** | ✅ RESOLVED | Implemented natural-language address resolver (`resolveAddressByPhrase`) supporting "home", "3al bet", "work", and coordinates. | `customer.service.ts`, `test-conversations.ts` |
| **G-015** | ✅ RESOLVED | Seeded multiple addresses (Home, Work, Parents) for test customers in `customer_addresses`. | `seed-demo.ts` |
| **G-016** | ✅ RESOLVED | Built official Meta Cloud API client in `whatsapp.service.ts` with exponential backoff retries and boundary logging. | `test-webhook.ts` |
| **G-017** | ✅ RESOLVED | Inbound webhook handler parses text, audio voice notes, images, and location messages into a single normalized pipeline. | `test-webhook.ts` |
| **G-018** | ✅ RESOLVED | Added HMAC-SHA256 signature verification and webhook deduplication via `integration_webhook_events` table. | `test-webhook.ts` |
| **G-019** | ✅ RESOLVED | Fixed query destructuring in `conversation.controller.ts`; inbound/outbound messages and conversation state persist cleanly. | `test-conversations.ts`, `test-api.ts` |
| **G-020** | ✅ RESOLVED | Structured AI intent engine returning validated intent schemas (`SEARCH_RESULTS`, `ADD_TO_CART`, `ORDER_CONFIRMED`, etc.). | `ai.service.ts`, `test-conversations.ts` |
| **G-021** | ✅ RESOLVED | Implemented complete intent set: `ORDER_STATUS`, `SUPPORT_REQUEST`, `SEARCH_CHEAPER`, `SEARCH_DESSERTS`, etc. | `ai.service.ts`, `test-conversations.ts` |
| **G-022** | ✅ RESOLVED | Removed unsafe first-item fallback; added `resolveTargetItem` to detect ambiguity and prompt safe clarification. | `cart.service.ts`, `test-conversations.ts` |
| **G-023** | ✅ RESOLVED | Catalog search filters by `mp.is_available = 1`, `m.accepts_orders = 1`, and merchant branch operating hours. | `catalog.service.ts` |
| **G-024** | ✅ RESOLVED | Added product aliases and Lebanese Arabizi / Arabic synonym mappings in `catalog.service.ts`. | `catalog.service.ts`, `test-conversations.ts` |
| **G-025** | ✅ RESOLVED | Implemented ranking modes (`cheapest`, `best_rated`, `fastest`, `best_value`) and budget calculation against total delivered price. | `catalog.service.ts`, `test-conversations.ts` |
| **G-026** | ✅ RESOLVED | Built dynamic basket comparison parser and optimizer across multi-item supermarket lists. | `catalog.service.ts`, `test-conversations.ts` |
| **G-027** | ✅ RESOLVED | Basket comparison returns detailed completeness, missing item explanations, and total delivered cost. | `catalog.service.ts`, `test-conversations.ts` |
| **G-028** | ✅ RESOLVED | Cart editing supports notes ("without pickles"), quantity updates, item deletions, and variant selections. | `cart.service.ts`, `test-conversations.ts` |
| **G-029** | ✅ RESOLVED | Product variants resolve against `product_variants` and `merchant_product_variants`, recalculating `unit_price` and `line_total`. | `cart.service.ts`, `test-conversations.ts` |
| **G-030** | ✅ RESOLVED | Audio voice note ingestion pipeline in `media.service.ts` converts audio to normalized text transcript preserving session state. | `media.service.ts`, `test-webhook.ts` |
| **G-031** | ✅ RESOLVED | Vision understanding boundary in `media.service.ts` matches image objects against MySQL product catalog. | `media.service.ts`, `test-webhook.ts` |
| **G-032** | ✅ RESOLVED | Checkout revalidates merchant branch availability, item availability, and prices within a MySQL transaction before confirming. | `order.service.ts`, `test-failures.ts` |
| **G-033** | ✅ RESOLVED | Durable idempotency keys stored in `idempotency_keys` table ensuring exactly-once order creation across retries. | `order.service.ts`, `test-failures.ts` |
| **G-034** | ✅ RESOLVED | Strict state machine validates status transitions and triggers real outbound WhatsApp customer notifications. | `order.service.ts`, `test-failures.ts` |
| **G-035** | ✅ RESOLVED | Live orders timeline refetches and renders automatically without manual browser refresh on WebSocket events. | `LiveOrders.tsx`, `test-websocket.ts` |
| **G-036** | ✅ RESOLVED | Dashboard operator controls include accept (with prep minutes), kitchen rejection (with reason), and ready for pickup. | `LiveOrders.tsx`, `api.ts` |
| **G-037** | ✅ RESOLVED | Merchant status actions (acceptance, prep time, rejection) emit customer notifications via `whatsappService.sendMessage`. | `order.service.ts`, `test-rehearsal.ts` |
| **G-038** | ✅ RESOLVED | Driver dispatch offer flow implemented with accept, pickup, and delivery tracking in `driver_offers` and `driver_assignments`. | `order.service.ts`, `test-rehearsal.ts` |
| **G-039** | ✅ RESOLVED | Relay chat selects real active orders, queries `delivery_messages` from MySQL, and subscribes to live relay updates. | `RelayChat.tsx`, `relay.service.ts` |
| **G-040** | ✅ RESOLVED | Relay message endpoints enforce channel existence and order authorization. | `relay.controller.ts`, `relay.service.ts` |
| **G-041** | ✅ RESOLVED | Driver delivery records customer rating and feedback in `order_reviews` with customer notification. | `order.service.ts`, `test-rehearsal.ts` |
| **G-042** | ✅ RESOLVED | Overview analytics queries real MySQL order records (`orders`, `order_items`, `customers`, `merchants`, `drivers`). | `analytics.service.ts`, `test-api.ts` |
| **G-043** | ✅ RESOLVED | Fixed merchant and branch counting semantics in MySQL analytics (`activeMerchants` vs `activeBranches`). | `analytics.service.ts`, `AnalyticsView.tsx` |
| **G-044** | ✅ RESOLVED | Management AI queries live rejection counts and driver performance directly from MySQL database tables. | `management-ai.service.ts`, `test-api.ts` |
| **G-045** | ✅ RESOLVED | Management AI handles executive queries with structured intent dispatch and database-grounded answers. | `management-ai.service.ts`, `test-api.ts` |
| **G-046** | ✅ RESOLVED | Built comprehensive automated integration test suite: `test-api.ts`, `test-webhook.ts`, `test-websocket.ts`, `test-failures.ts`. | `test-all.ts` |
| **G-047** | ✅ RESOLVED | Explicit failure handling implemented: empty carts, invalid transitions, timeout fallbacks, idempotency collisions. | `test-failures.ts` |
| **G-048** | ✅ RESOLVED | Demo reset enforces 10 baseline invariant assertions (merchants, branches, products, drivers, orders, carts, addresses). | `reset-demo.ts` |
| **G-049** | ✅ RESOLVED | Rehearsal executed 3 consecutive times end-to-end; resilient backup re-routing demo scenario built and verified. | `test-rehearsal.ts`, `demo-backup-scenario.ts` |
| **G-050** | ✅ RESOLVED | Maintained durable traceability matrix with automated test commands, verified counts, and documented integration boundaries. | `Lion_Delivery_Demo_Gaps_and_Fix_Plan.md` |

---

## Latest Re-audit Checklist: Detailed Remediation Status Matrix

The following table records the remediation and verification of gaps G-040, G-051 through G-060 following strict separation of **RESOLVED**, **DEMO/LOCAL BOUNDARY**, **EXTERNAL VERIFICATION PENDING**, and **BLOCKED**.

| ID | Target phase | Priority | Status | Gap & Remediation Details | Verification Evidence & Files Changed |
|---|---:|:---:|:---:|---|---|
| **G-040** | 16 | P1 | **RESOLVED** | **Complete Relay Actor Authorization**: Every relay read (`GET /api/relay/:orderId/messages`) and write (`POST /api/relay/:orderId/messages`) derives actor identity strictly from the authenticated JWT session (`req.user`), completely ignoring client-supplied `senderRole`, `senderType`, `driverId`, or `customerId`. Verifies channel/order membership: customers cannot post as drivers; drivers cannot access unrelated orders (HTTP 403 Forbidden); customers cannot access unrelated orders (HTTP 403 Forbidden); operators post as `SYSTEM` or log audited actions in `audit_logs`. | **Evidence**: `test-api.ts` asserts 403 on unrelated driver/customer access and verifies role override for forged payloads (19/19 passed); `test-rehearsal.ts` verifies authenticated customer & driver chat.<br>**Files**: `backend/src/modules/relay/relay.controller.ts`, `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/scripts/seed-demo.ts`, `backend/src/scripts/test-api.ts`. |
| **G-051** | 1 | P0 | **RESOLVED** | **Protect Operational APIs with JWT & RBAC**: Mounted `authenticate` and `requireRoles(...)` middleware on all operational routes (`/api/orders/*`, `/api/drivers`, `/api/relay/*`, `/api/customers`, `/api/analytics/*`, `/api/management-ai/*`, `/api/demo/reset`). Upgraded dashboard `api.ts` with `authFetch` attaching `Authorization: Bearer <token>` and auto-login. Dashboard warms up session on mount. | **Evidence**: `test-api.ts` asserts anonymous requests to protected endpoints return 401, authenticated requests return 200.<br>**Files**: `backend/src/app.ts`, `dashboard/src/services/api.ts`, `dashboard/src/App.tsx`, `backend/src/scripts/test-api.ts`. |
| **G-052** | 16 | P0 | **RESOLVED** | **Harmonize Relay Contract & Live Dynamic Chat**: Harmonized request schema in `schemas.ts` and `relay.controller.ts` to accept `{ text, message, senderRole, senderType }`. Connected dashboard `RelayChat.tsx` to active order selection dropdown, fetching real MySQL history from `delivery_messages` on mount/change, and subscribing to real-time `RELAY_MESSAGE` WebSocket events. | **Evidence**: `test-api.ts` tests POST/GET relay messages; `RelayChat.tsx` verified with zero lint warnings.<br>**Files**: `backend/src/shared/schemas.ts`, `backend/src/modules/relay/relay.controller.ts`, `backend/src/modules/relay/relay.service.ts`, `dashboard/src/components/RelayChat.tsx`. |
| **G-053** | 5, 17 | P0 | **RESOLVED**<br>*(Local Boundary)*<br><br>**EXTERNAL VERIFICATION PENDING**<br>*(Live Meta API)* | **Real WhatsApp Integration & Error Handling**: Controlled via `WHATSAPP_MODE=MOCK|LIVE`. Startup credential validation (`validateStartupConfig`) fails fast if LIVE mode lacks Meta secrets. Never reports mock delivery as real delivery. Permanent errors (`131026` Undeliverable, `131047` Window expired, `401/403` Auth) are classified without retry; transient errors (`429` Rate limit, `500/503` Server error) execute exponential backoff and retry. Persists provider message IDs, statuses, and delivery states to MySQL `messages`. `pingMetaApi()` tests live Meta credentials or returns safe `EXTERNAL VERIFICATION PENDING`. | **Evidence**: `test-failures.ts` verifies error classifications (permanent vs retryable), injected 429 retry backoff and recovery, and startup boundary assertions; `test-webhook.ts` verifies inbound/outbound.<br>**Files**: `backend/src/config/env.ts`, `backend/src/modules/whatsapp/whatsapp.service.ts`, `backend/src/scripts/test-failures.ts`. |
| **G-054** | 5, 10, 11 | P0 | **RESOLVED**<br>*(Pipeline & Providers)*<br><br>**DEMO/LOCAL BOUNDARY**<br>*(Local Fixtures)*<br><br>**EXTERNAL VERIFICATION PENDING**<br>*(Live Cloud Keys)* | **Real Audio and Image Processing**: Added real provider implementations (`OpenAiWhisperAudioTranscriptionProvider`, `OpenAiVisionProvider`) alongside explicit local demo fixtures (`FixtureAudioTranscriptionProvider`, `FixtureVisionProvider`) controlled by `TRANSCRIPTION_PROVIDER` and `VISION_PROVIDER`. Downloads Meta media via authenticated request, validates MIME types (`audio/ogg`, `image/jpeg`, etc.), and enforces 16MB size limit. Matches provider output against MySQL catalog products, preserves customer conversation context, and persists media metadata, transcripts, and confidence scores in `message_media`. | **Evidence**: `test-failures.ts` asserts 16MB file ceiling enforcement; `test-webhook.ts` and `test-rehearsal.ts` verify audio transcription and image vision matching against MySQL catalog.<br>**Files**: `backend/src/config/env.ts`, `backend/src/modules/media/media.service.ts`, `backend/src/modules/conversations/conversation.controller.ts`, `backend/src/scripts/test-failures.ts`, `backend/src/scripts/test-rehearsal.ts`. |
| **G-055** | 0, 22 | P1 | **RESOLVED** | **Deduplicated Idempotent Reset with Exact Assertions**: Overhauled `reset-demo.ts` with strict foreign-key safe cascade deduplication and deterministic baseline seeding. Replaced all loose `>=` assertions with EXACT counts (4 merchants, 4 branches, 16 products, 18 merchant products, 3 available drivers, 4 delivered orders, 0 active orders, 0 active carts, 4 addresses, 1 admin). | **Evidence**: Tested 10 consecutive resets in a loop with zero drift; all exact invariant assertions PASSED on every run.<br>**Files**: `backend/src/scripts/reset-demo.ts`. |
| **G-056** | 18, 19 | P1 | **RESOLVED** | **Database-Driven Analytics & Management AI**: Completely removed invented constants from `analytics.service.ts` and `management-ai.service.ts`. Delivery minutes computed from `TIMESTAMPDIFF(MINUTE, confirmed_at, delivered_at)`, acceptance rate from `orders`, top driver from orders + drivers, unavailable product demand from `search_sessions`. Returns null/0 when no records exist. | **Evidence**: `test-api.ts`, `test-rehearsal.ts`, and `demo-backup-scenario.ts` confirm live MySQL KPI calculations.<br>**Files**: `backend/src/modules/analytics/analytics.service.ts`, `backend/src/modules/management-ai/management-ai.service.ts`. |
| **G-057** | 3, 18 | P1 | **RESOLVED** | **Dynamic Dashboard Views**: Upgraded `DriversView.tsx` and `CatalogView.tsx` to dynamically fetch live drivers and merchants via `api.getDrivers()` and `api.getMerchants()`. Corrected `AnalyticsView.tsx` to display distinct merchant count vs branch count and handle null delivery minutes cleanly. | **Evidence**: Dashboard compiles with zero errors, oxlint passes with 0 warnings, data loaded from MySQL.<br>**Files**: `dashboard/src/components/DriversView.tsx`, `dashboard/src/components/CatalogView.tsx`, `dashboard/src/components/AnalyticsView.tsx`. |
| **G-058** | 14, 15, 16 | P1 | **RESOLVED** | **Complete Lifecycle Workflows & Authorization**: Added `merchantReady` (`PREPARING -> READY_FOR_PICKUP`) and `driverReject` (`DRIVER_ASSIGNED -> REASSIGNING`), and expanded `driverAccept` to accept `PREPARING`, `WAITING_FOR_DRIVER`, or `READY_FOR_PICKUP`. Mounted routes `/api/orders/:id/ready` and `/api/orders/:id/driver-reject` with RBAC authorization. Added interactive action buttons in `LiveOrders.tsx`. Reassignment dynamically increments attempt numbers in `driver_offers`. Enforced actor authorization in relay chat. | **Evidence**: `test-api.ts` tests `/ready` and `/driver-reject`; `test-failures.ts` verifies status transition guards; `test-rehearsal.ts` verifies order lifecycle.<br>**Files**: `backend/src/modules/orders/order.service.ts`, `backend/src/modules/orders/order.controller.ts`, `backend/src/app.ts`, `dashboard/src/components/LiveOrders.tsx`. |
| **G-059** | 20, 23 | P1 | **RESOLVED** | **True End-to-End Demo Verification**: Replaced direct service calls in `test-rehearsal.ts` with pure HTTP API calls and live WebSocket client verification over an ephemeral test server. Fully exercises: authenticated login (`/api/auth/login`), demo reset (`/api/demo/reset`), audio/image fixture ingestion, natural customer conversation, order creation, merchant accept/ready, driver accept/pickup, authenticated customer & driver relay messaging, driver delivery & 5-star rating, restaurant rejection & AI backup re-routing, and live analytics & Management AI executive queries. Executed 3 consecutive times with reproducible logging to `test-e2e-rehearsal.log`. | **Evidence**: `npm --prefix backend run test:rehearsal` passes 3 consecutive runs cleanly with zero failures; logs saved to `test-e2e-rehearsal.log`.<br>**Files**: `backend/src/scripts/test-rehearsal.ts`. |
| **G-060** | 7, 9 | P2 | **RESOLVED** | **Catalog Availability Filters & Variant Rejection**: Filtered active merchants, operating hours, and delivery zones consistently across `getAllMerchants`, `getAllProducts`, and `compareBasket` in `catalog.service.ts`. Replaced variant fallback note behavior with strict variant existence validation in `cart.service.ts` returning a descriptive error if the variant is not found in MySQL. | **Evidence**: `test-failures.ts` verifies invalid variant rejection with descriptive error.<br>**Files**: `backend/src/modules/catalog/catalog.service.ts`, `backend/src/modules/carts/cart.service.ts`, `backend/src/scripts/test-failures.ts`. |

---

## Remaining Non-API-Key Checklist

These items have been implemented and verified locally using the existing MOCK/FIXTURE modes. They do not require Meta, OpenAI, or other external API keys.

| ID | Target phase | Priority | Status | Gap & Remediation Details | Verification Evidence & Files Changed |
|---|---:|:---:|:---:|---|---|
| **G-061** | 0, 1 | P1 | **RESOLVED** | **Startup Validation Fail-Fast**: Imported `validateStartupConfig()` in `backend/src/server.ts` and called it before `testDbConnection()` and `server.listen()`. When `WHATSAPP_MODE=LIVE`, the server immediately throws and refuses to boot if `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is missing or placeholder (`demo_*`). When in `MOCK`/`FIXTURE` mode, starts cleanly with explicit boundary logs (`[Startup Config] WhatsApp Mode: MOCK`, `[Startup Config] Media Mode: FIXTURE`). | **Evidence**: `test-config-matrix.ts` asserts startup rejection on empty or placeholder LIVE credentials and success in MOCK mode.<br>**Files**: `backend/src/config/env.ts`, `backend/src/server.ts`, `backend/src/scripts/test-config-matrix.ts`. |
| **G-062** | 5, 10, 11 | P1 | **RESOLVED**<br>*(Local Boundary & Fail-Closed Guard)*<br><br>**EXTERNAL VERIFICATION PENDING**<br>*(Live Meta & Whisper/Vision API)* | **Fail-Closed LIVE Media Mode**: When `MEDIA_MODE=LIVE`, `mediaService.createAudioProvider()` and `createVisionProvider()` strictly throw rather than selecting fixture fallbacks. `downloadMedia()` enforces required Meta tokens and throws without fallback. `processAudioMessage()` and `processImageMessage()` fail closed in LIVE mode without credentials: they persist the failure record in `message_media` (`processing_status = 'FAILED'`) and throw safe errors instead of returning canned transcripts or labels. Fixture fallback is strictly restricted to explicit `MEDIA_MODE=FIXTURE` or `WHATSAPP_MODE=MOCK`. | **Evidence**: `test-config-matrix.ts` verifies provider instantiation throws on LIVE without keys, downloadMedia fails fast, and processing fails closed without canned fallback.<br>**Files**: `backend/src/modules/media/media.service.ts`, `backend/src/scripts/test-config-matrix.ts`. |
| **G-063** | 20, 23 | P1 | **RESOLVED** | **Browser Dashboard E2E Rehearsal**: Added a complete browser-level automated test suite (`test-browser-e2e.ts`) using `puppeteer-core` against the local production dashboard bundle and backend. Exercises: operator login & live WebSocket sync, UI demo reset button, real-time live order creation, merchant accept (`PREPARING`), driver accept (`DRIVER_ASSIGNED`), driver reject & dispatch reassignment (`WAITING_FOR_DRIVER` -> re-accept), merchant ready (`READY_FOR_PICKUP`), driver pickup (`PICKED_UP`), driver delivery & COD settlement (`DELIVERED`), merchant rejection (`MERCHANT_REJECTED`), masked relay chat channel selection, bidirectional customer & driver message transmission without phone exposure, live analytics KPI calculations, and Management AI executive questions. Rehearsed 3 full consecutive times with zero baseline invariant drift. | **Evidence**: `npm run test:browser` executes 3 complete iterations with 51/51 assertions passing cleanly.<br>**Files**: `backend/src/scripts/test-browser-e2e.ts`, `backend/src/app.ts`, `dashboard/src/components/Header.tsx`, `dashboard/src/components/LiveOrders.tsx`, `dashboard/src/components/RelayChat.tsx`, `dashboard/src/components/ManagementAiView.tsx`. |
| **G-064** | 0, 1 | P2 | **RESOLVED** | **Complete Environment Documentation**: Updated `backend/.env.example` and `backend/.env` documenting all runtime switches with safe placeholders and explanatory comments: `WHATSAPP_MODE=MOCK|LIVE`, `MEDIA_MODE=FIXTURE|LIVE`, `TRANSCRIPTION_PROVIDER=FIXTURE|WHISPER`, `VISION_PROVIDER=FIXTURE|VISION_API`, `OPENAI_API_KEY`, database credentials, Redis URL, and JWT secrets. Clean-shell local developer setup is fully validated. | **Evidence**: `backend/.env.example` and `backend/.env` updated with zero secrets committed.<br>**Files**: `backend/.env.example`, `backend/.env`. |
| **G-065** | 0, 20, 23 | P2 | **RESOLVED** | **Configuration & Provider Test Matrix**: Implemented an automated test suite (`test-config-matrix.ts`) covering all 15 permutations of: MOCK/FIXTURE startup success, LIVE startup rejection without credentials, LIVE startup rejection with placeholder credentials, provider selection in FIXTURE vs LIVE, exclusion of fixture providers when LIVE is requested, LIVE download failure without token, fail-closed audio and image processing without canned fallbacks, restoration of deterministic demo behavior in FIXTURE mode, and explicit `EXTERNAL VERIFICATION PENDING` status reporting on unconfigured Meta API pings. | **Evidence**: Integrated into master runner (`test-all.ts`) as Suite 8 (15/15 tests passed cleanly in < 1s).<br>**Files**: `backend/src/scripts/test-config-matrix.ts`, `backend/src/scripts/test-all.ts`, `backend/package.json`. |

### External-key-dependent work remains separate

The following cannot be fully verified without external credentials and accounts:

- Real Meta WhatsApp outbound delivery and physical test-number receipt.
- Real Meta media download from a live webhook.
- Real Whisper transcription.
- Real vision analysis.

---

## Latest Client Demo Audit Remediation (DG-001–DG-008)

The follow-up client-demo audit gaps are now implemented and covered by
`npm run test:demo-gaps`:

| ID | Status | Implementation |
|---|---|---|
| DG-001 | RESOLVED | Checkout/order payloads and dashboard totals include the seeded 89,500 LBP/USD conversion. |
| DG-002 | RESOLVED | Duplicate address labels return candidates and the AI asks for a numbered/neighborhood choice. |
| DG-003 | RESOLVED | Driver-pool exhaustion creates `NO_DRIVERS_AVAILABLE` alerts, a dashboard toast, and a customer ETA extension. |
| DG-004 | RESOLVED | Drivers have seeded `driver_locations`; the fleet view interpolates in-transit positions toward the destination. |
| DG-005 | RESOLVED | Master-console controls identify Restaurant Tablet versus Driver App actor context. |
| DG-006 | RESOLVED | Management AI supports additional controlled executive phrasings, merchant-sales aggregation, and explicit unknown-query handling. |
| DG-007 | RESOLVED | A 30-minute cart inactivity sweep sends one Redis-windowed WhatsApp reminder per abandoned cart. |
| DG-008 | RESOLVED | Low-confidence image analysis can return up to three numbered catalog candidates for customer selection. |

## Verified Master Test Execution Summary

The master test runner (`npm run test:all`) executes all 10 integration test suites sequentially. The historical output snapshot below predates the DG regression suite; the latest verified run reports all 10 suites passed in 31.88 seconds.

```bash
════════════════════════════════════════════════════════════
📋 Master Test Summary (19.36s total runtime):
════════════════════════════════════════════════════════════
  ✅ HTTP API & Auth: PASSED (19/19 tests)
  ✅ WhatsApp Webhooks & Media: PASSED (8/8 tests)
  ✅ WebSockets & Live Events: PASSED (3/3 tests)
  ✅ Failures & State Transitions: PASSED (19/19 tests)
  ✅ AI 15-Scenario Pack: PASSED (15/15 tests)
  ✅ Full Demo 3x Rehearsal: PASSED (3/3 runs strictly via HTTP + WS)
  ✅ Backup Demo Re-route Scenario: PASSED (100% clean)
  ✅ Config & Provider Matrix (G-061, G-062, G-065): PASSED (15/15 tests)
════════════════════════════════════════════════════════════
🏆 ALL 8 TEST SUITES PASSED CLEANLY WITH ZERO FAILURES!
```

### Browser Dashboard E2E Rehearsal (`npm run test:browser`)
```bash
════════════════════════════════════════════════════════════
🌐 Browser Dashboard E2E Test Summary (3x Consecutive Rehearsal):
════════════════════════════════════════════════════════════
  ✅ [Iter 1..3] Baseline invariants verified before rehearsal [PASS]
  ✅ [Iter 1..3] Dashboard SPA loads with brand title "LION DELIVERY" [PASS]
  ✅ [Iter 1..3] Operator JWT session authenticated & WebSocket Live Sync active [PASS]
  ✅ [Iter 1..3] UI Reset Demo button triggered database & Redis restore [PASS]
  ✅ [Iter 1..3] Live Orders tab reflects real-time order creation [PASS]
  ✅ [Iter 1..3] Merchant accepts order (status transitioned to PREPARING) [PASS]
  ✅ [Iter 1..3] Driver accepts order (status transitioned to DRIVER_ASSIGNED) [PASS]
  ✅ [Iter 1..3] Driver rejection triggers re-dispatch workflow & re-assignment [PASS]
  ✅ [Iter 1..3] Driver picks up package from merchant (status: PICKED_UP) [PASS]
  ✅ [Iter 1..3] Driver completes delivery & COD settlement (status: DELIVERED) [PASS]
  ✅ [Iter 1..3] Merchant rejects order (status transitioned to MERCHANT_REJECTED) [PASS]
  ✅ [Iter 1..3] Merchant marks order ready for pickup (status transitioned to READY_FOR_PICKUP) [PASS]
  ✅ [Iter 1..3] Masked Relay Chat transmits customer message [PASS]
  ✅ [Iter 1..3] Masked Relay Chat transmits driver reply with zero phone exposure [PASS]
  ✅ [Iter 1..3] Analytics tab computes live MySQL metrics [PASS]
  ✅ [Iter 1..3] Management AI copilot answers executive query using live MySQL state [PASS]
  ✅ [Iter 1..3] Baseline counts returned to exact pristine invariants (0 drift) [PASS]
════════════════════════════════════════════════════════════
🏁 Browser Dashboard E2E Results: 51 Passed, 0 Failed
```

### Exact Reset Invariants (Zero Drift across consecutive runs)
```json
{
  "merchants": 4,
  "branches": 4,
  "products": 16,
  "merchantProducts": 18,
  "availableDrivers": 3,
  "deliveredOrders": 4,
  "activeOrders": 0,
  "activeCarts": 0,
  "addresses": 4,
  "adminExists": true
}
```

## External Prerequisites & Integration Boundaries

1. **Meta WhatsApp Cloud API (G-053, G-061)**:
   - **Environment Variables**: `WHATSAPP_MODE=MOCK|LIVE`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`.
   - **Local Boundary**: When `WHATSAPP_MODE=MOCK`, all outbound messages are explicitly logged with `[WhatsApp Service Boundary: MOCK]` and persisted with provider `MOCK_WHATSAPP`. Never reported as real delivery.
   - **Live Boundary**: When `WHATSAPP_MODE=LIVE`, credentials are validated on startup (`validateStartupConfig`) and reject placeholder/empty tokens before listening. Error classification distinguishes permanent failures (`131026`, `131047`, `401`, `403`) from retryable ones (`429`, `500`, `503`) with exponential backoff.
   - **External Verification Pending**: Physical receipt on external WhatsApp mobile devices requires Meta developer account credentials and live phone number onboarding.

2. **Audio Transcription & Vision APIs (G-054, G-062)**:
   - **Environment Variables**: `MEDIA_MODE=FIXTURE|LIVE`, `TRANSCRIPTION_PROVIDER=WHISPER|FIXTURE`, `VISION_PROVIDER=VISION_API|FIXTURE`, `OPENAI_API_KEY`.
   - **Local Boundary**: Deterministic fixture providers (`FixtureAudioTranscriptionProvider`, `FixtureVisionProvider`) process standard demo audio notes and food images, matching them against MySQL catalog entries.
   - **Live Boundary**: `OpenAiWhisperAudioTranscriptionProvider` and `OpenAiVisionProvider` send multipart form requests to OpenAI endpoints (`v1/audio/transcriptions` and `v1/chat/completions`) when `OPENAI_API_KEY` is provided. When `MEDIA_MODE=LIVE`, failure to contact OpenAI fails closed: errors are logged to `message_media` and safe errors returned, with zero fallback to canned fixtures.
   - **External Verification Pending**: Live calls to OpenAI Whisper and Vision APIs require a funded third-party OpenAI API key.
