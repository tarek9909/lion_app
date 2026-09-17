# Lion Delivery — Permanent Project Operating Rules for Coding Agents

> **Authoritative Specification & Operating Rules for Antigravity, Claude, Codex, and all Future AI/Human Engineers working on Lion Delivery.**
> **Last Updated: 17 September 2026 (repository-audited)**

---

## 1. Project Identity & Core Principle

**Lion Delivery** is an autonomous WhatsApp-first delivery operations platform.

### The Foundational Principle:
> **Customers order through WhatsApp, while Lion Delivery manages the complete operation from a centralized management dashboard.**

Customers **do not** download or use a dedicated mobile application. They interact naturally through WhatsApp using text, voice notes, images, or shared locations. The platform interprets their requests, searches catalogs across merchants, manages active carts, confirms delivery addresses, handles checkout, orchestrates fulfillment between merchants and drivers, facilitates private communications, and provides operational visibility through real-time dashboards and management AI copilots.

---

## 2. Current Demo Objective vs. Future SaaS Direction

### Current Demo Objective (Immediate Priority)
The immediate platform target is a polished, resilient, client-facing demo proving the end-to-end golden flow:
```text
Customer WhatsApp (Lebanese Arabizi / Arabic / English / Voice / Image)
        ↓
AI Conversational Engine (Gemini 3.8 Flash + Redis state + memory)
        ↓
Multi-turn Context & Clarification (Budget, quantity, variant, notes)
        ↓
Catalog Search & Basket Comparison (Cross-merchant discovery)
        ↓
Cart Management & Multi-turn Modification
        ↓
Saved Multimedia Address ("3al bet", "Home", Coordinates)
        ↓
Pre-Checkout Total & Strict Confirmation Gate
        ↓
Confirmed Order in Live Dashboard
        ↓
Merchant Workflow (Accept with Prep Time / Kitchen Reject / Ready)
        ↓
Driver Dispatch (Accept / Reject / Reassign / Picked Up / Delivered)
        ↓
Private Masked Communication Relay (No phone numbers exposed)
        ↓
Delivered Order, COD Reconciliation & Customer Feedback
        ↓
Live Operational Analytics & Management AI Executive Answers
```

### Future SaaS Platform Direction (Long-Term Architecture)
Lion Delivery is **not** an architecture intended to serve only one delivery office forever. It is designed to evolve into a **multi-tenant delivery operating system (Delivery SaaS)** serving multiple independent delivery offices / delivery companies.
- **Platform Layer**: Superadmin governance, billing, system metrics, shared merchant catalog.
- **Tenant Layer (Delivery Offices)**: Tenant A (e.g., Lion Delivery Saida), Tenant B (Beirut Express), Tenant C.
- **Shared Merchant Network**: Global merchant master records, branch networks, and master menus linked to tenants via explicit relationships (`tenant_merchant_relationships`).

> **Cardinal Rule for Current Work**: Even while building and refining the Lion Delivery demo, **never hardcode assumptions that Lion Delivery is the only delivery company that will ever exist**. Keep tenant isolation boundaries clean in backend data-access layers so multi-tenancy can be adopted without architectural rewrites.

---

## 3. Authoritative Source-of-Truth Documents

All architectural and business decisions are governed by the following canonical documents:

1. **`docs/Lion_Delivery_Full_Business_Documentation.md`**: Authoritative for business scope, operating rules, user journeys, and functional expectations.
2. **`docs/Lion_Delivery_Full_Technical_Documentation.md`**: Authoritative for system architecture, modular boundaries, event flows, and API blueprints.
3. **`Lion_Delivery_Full_MySQL_Database.sql`**: The committed schema baseline for fresh installs. It currently contains **139 `CREATE TABLE` declarations and 5 views**; the older “121 base tables” claim elsewhere is historical and stale.
4. **`docs/Lion_Delivery_Master_Implementation_Plan.md`** and **`docs/Lion_Delivery_Project_Kickoff_Message.md`**: Full production roadmap, phase gates, and implementation discipline.
5. **`docs/Lion_Delivery_Full_Demo_Implementation_Plan.md`** and **`docs/Lion_Delivery_Demo_Kickoff_Message.md`**: Immediate client-demo scope, priority order, and demo acceptance criteria.
6. **`docs/Lion_Delivery_Demo_Gaps_and_Fix_Plan.md`**: Gap register and remediation evidence (G-001–G-065 and DG-001–DG-008). Treat completion claims as evidence to revalidate against current code and tests.
7. **`docs/Lion_Delivery_Gemini_AI_Completion_Claim_Gap_Audit.md`**, **`AI_CONTINUOUS_LEARNING_GAPS_AND_REMEDIATION.md`**, and **`walkthrough.md`**: AI safety, learning, provider-boundary, and verification guidance. Historical audit findings are not superseded merely by a later narrative claim; inspect the live code path.
8. **Supporting runbooks in `docs/`** (notably the AI-flow, customer-conversation, Gemini-training, and WhatsApp deployment documents): use them for operational and specialist guidance, subject to the precedence below.

### Precedence in Conflicts:
1. **Business Rules** take precedence for expected system behavior and customer experience.
2. **Technical Documentation** defines architectural layering and boundary contracts.
3. **Database Schema** defines the persistence baseline. Any schema changes post-baseline must be executed through forward migrations.

---

## 4. Approved Technology Stack

- **Dashboard**: React 19, Vite, TypeScript, Vanilla CSS design system, Lucide React icons.
- **Backend API & Real-time**: Node.js (v20+), Express 4, TypeScript, WebSocket (`ws`), REST API standards.
- **Database & State**: MySQL 8.0+ (`mysql2`), Redis 6.0+ (`ioredis` for session state, rate limiting, pub/sub, candidate memory).
- **AI Engine**: Google Gemini (production provider: `gemini-3.8-flash`, currently called through the repository's direct HTTP provider rather than an installed SDK), bounded 600-token customer-response budget, with a shadow/canary design. Non-production test fallback: `smart_nlu`.
- **Validation**: `zod` and `ajv` for runtime schema enforcement on all HTTP endpoints and AI tool payloads.
- **External Integrations**:
  - Official Meta WhatsApp Business Platform / Cloud API (v25.0+ Graph API).
  - Audio Transcription: OpenAI Whisper API / Meta Media Download (with local fixture fallback).
  - Vision Analysis: OpenAI Vision API / Meta Media Download (with local fixture fallback).
  - Private Calling: LiveKit (future production calling/recording layer; the REST text relay exists but still has lifecycle/security hardening gaps).
  - Maps / Geolocation: Geocoding and coordinate fixtures.

---

## 5. Actual Repository Structure

```text
c:\Projects\lion/
├── package.json                         # Root workspace scripts orchestrating backend & dashboard
├── README.md                            # High-level architecture, quick-start, credentials
├── walkthrough.md                       # Verifiable demo walkthrough, audit decisions, commands
├── AI_CONTINUOUS_LEARNING_GAPS_AND_REMEDIATION.md # Continuous learning gap audit & status
├── Lion_Delivery_Full_MySQL_Database.sql# Full MySQL 8 schema (139 table declarations, 5 views)
├── docs/                                # Comprehensive project specifications & runbooks
├── datasets/                            # Versioned supervised training datasets & schemas
│   └── v1/
│       ├── schemas/                     # turn-schema.json, dataset_manifest.json
│       └── *.jsonl                      # Redacted conversation dataset splits
├── backend/                             # Express + TypeScript + MySQL + Redis Backend
│   ├── package.json                     # Backend scripts, dependencies, devDependencies
│   ├── tsconfig.json                    # Backend TypeScript configuration
│   ├── .env.example                     # Safe environment template with documented boundaries
│   └── src/
│       ├── server.ts                    # Bootstrap, fail-fast validation, workers, WS mount
│       ├── app.ts                       # Express app, middleware, routes, static SPA serving
│       ├── config/
│       │   └── env.ts                   # Zod env schema, startup fail-fast, routing resolver
│       ├── database/
│       │   ├── db.ts                    # MySQL connection pool & ping health check
│       │   ├── redis.ts                 # Redis client & ping health check
│       │   ├── ensure-ai-learning-tables.ts # Legacy startup schema provisioning for AI learning (see known gaps)
│       │   └── migrations/              # Forward schema migrations (PII purge, order batching)
│       ├── modules/
│       │   ├── ai/                      # AI orchestration, Gemini service, prompt templates,
│       │   │                            # checkout safety, language localizer, tools executor,
│       │   │                            # memory, dataset harvesting, evaluation, shadow/canary
│       │   ├── analytics/               # Real database-driven operational KPI aggregations
│       │   ├── auth/                    # PBKDF2 hashing, JWT verification, RBAC middleware
│       │   ├── carts/                   # Multi-turn cart service, abandonment scheduler
│       │   ├── catalog/                 # Product search, aliases, basket comparison, ranking
│       │   ├── conversations/           # Message history, webhook queues, background worker
│       │   ├── customers/               # Customer profiles, preferences, saved addresses
│       │   ├── dashboard/               # Dashboard stats, WhatsApp inbox, AI learning endpoints
│       │   ├── management-ai/           # Executive Q&A copilot grounded in live MySQL queries
│       │   ├── media/                   # Audio/vision providers (live & fixture boundaries)
│       │   ├── orders/                  # Order state machine, lifecycle transitions, dispatch
│       │   ├── relay/                   # Masked customer-driver REST relay (lifecycle hardening still required)
│       │   └── whatsapp/                # Meta Cloud API client, retry logic, HMAC validation
│       ├── scripts/                     # Seeders, demo reset, isolation harness, and focused regression suites
│       │   ├── init-db.ts               # Database initialization
│       │   ├── seed-demo.ts             # Deterministic baseline data seeder
│       │   ├── reset-demo.ts            # Idempotent demo reset with 10 exact assertions
│       │   ├── test-all.ts              # 15-suite master integration test runner (disposable DB)
│       │   ├── test-isolation.ts        # Disposable MySQL DB & Redis DB 15 test harness
│       │   └── test-*.ts                # Specific automated regression test suites
│       ├── services/                    # Shared WebSocket broadcaster (auth/scoping hardening required)
│       └── shared/                      # Standardized response envelopes, schemas, validation
└── dashboard/                           # React 19 + Vite + TypeScript Dashboard
    ├── package.json                     # Dashboard scripts (vite, build, oxlint)
    ├── vite.config.ts                   # Vite configuration with React plugin
    └── src/
        ├── App.tsx                      # Main application view switcher & toast provider
        ├── index.css                    # Design tokens, typography, dark/light theme CSS
        ├── components/                  # LiveOrders, RelayChat, CatalogView, DriversView,
        │                                # WhatsAppInbox, AILearningWorkbench, ManagementAiView
        └── services/                    # Typed API client (authFetch with JWT) & WebSocket client
```

---

## 6. Backend Architectural Rules

1. **Strict Layer Separation**:
   ```text
   Route Mount (app.ts)
     ↓
   Middleware (authenticate, requireRoles, validateBody, validateParams)
     ↓
   Controller (Extract request, coordinate response, map HTTP status)
     ↓
   Service (Owns all business logic, transactions, state rules)
     ↓
   Data Layer / Database (Direct MySQL queries, pool connections)
   ```
2. **No Logic in Routes or Controllers**: Controllers must remain thin coordinators. No SQL queries, pricing calculations, or business decisions inside route definitions or controllers.
3. **No Duplicate Services**: Never create `OrderService2.ts`, `NewOrderService.ts`, or `OrderServiceFinal.ts`. Locate existing services in `backend/src/modules/` and extend or refactor them in place.
4. **Zod Validation on Every Endpoint**: Every route accepting parameters or request bodies must enforce a Zod schema defined in `backend/src/shared/schemas.ts`. Invalid payloads must be rejected with HTTP 400 before reaching business services.
5. **Standardized Response Envelope**:
   - Success: `{ success: true, data: T, timestamp: string }` via `sendSuccess(res, data)`.
   - Error: `{ success: false, error: string, timestamp: string }` via `sendError(res, err, status)`.
   - Header: Every response attaches `x-request-id` for diagnostic correlation.
6. **No Leaking System Internals**: Never return raw SQL error messages, stack traces, or external provider error dumps to HTTP clients or WhatsApp customers.

---

## 7. Frontend Architectural Rules

1. **Real APIs Only**: The React dashboard must consume real backend endpoints via `dashboard/src/services/api.ts`. Static fake screens, disconnected buttons, or hardcoded mock presentations are strictly forbidden.
2. **Complete UI State Handling**: Every screen, card, or drawer must explicitly handle:
   - Loading states (skeletons / spinners)
   - Empty states (helpful messages, no blank cards)
   - Error states (actionable retry toasts)
   - Success feedback (visual confirmations)
   - Permission scoping (unauthorized controls hidden/disabled)
3. **WebSocket + Polling Fallback**: Real-time operational screens (`LiveOrders.tsx`, `RelayChat.tsx`) must:
   - Subscribe to the standardized WebSocket envelope: `{ type, payload, data, timestamp }`.
   - Implement automatic reconnection and event deduplication.
   - Maintain an 8-second polling fallback in case WebSocket connectivity degrades.
4. **Session Warm-Up and Credentials**: The current demo calls `api.login()` on mount and stores its JWT in browser storage. This is a local-demo convenience, not a production-safe credential model: do not embed credentials in the browser, and replace it with a real operator login/session flow before a production claim. All authenticated requests must use `authFetch` with a valid `Authorization: Bearer <token>`.
5. **Preserve Design Integrity**: Use existing CSS design tokens in `dashboard/src/index.css`. Maintain the dark/light aesthetic, clean borders, responsive layouts, and cohesive color palette.

---

## 8. Database & Data Integrity Rules

1. **Schema Baseline**: `Lion_Delivery_Full_MySQL_Database.sql` is the authoritative fresh-install baseline. At this audit it has 139 `CREATE TABLE` declarations and 5 views; documentation that states “121 base tables” is stale. Never retroactively edit this baseline to simulate a deployed schema change.
2. **Migrations Post-Baseline**: Any additions or schema changes must be a named, idempotent forward migration in `backend/src/database/migrations/`, tested against empty and populated databases, and recorded in migration documentation. Do not add new ad-hoc startup table provisioning like the legacy `ensure-ai-learning-tables.ts` path; migrate that legacy behavior to the normal migration path when it is touched.
3. **Never Destroy Historical Data**:
   - Never update or recalculate historical orders based on current product prices.
   - Completed orders must maintain an immutable snapshot (`subtotal`, `delivery_fee`, `grand_total`, `merchant_total`, `company_commission`, `driver_amount`, `currency`).
   - Financial ledger entries, cash reconciliations, settlements, audit logs, and message histories must never be mutated or purged without explicit retention policies.
4. **Public IDs vs. Internal IDs**:
   - Internal database foreign keys use `BIGINT UNSIGNED AUTO_INCREMENT`.
   - External APIs, WhatsApp conversations, and dashboard URLs must use `public_id (CHAR(36) UUID)` or business codes (e.g. `order_number`). Never add a new external numeric-ID selector. Existing numeric `/api/orders/:id` and `/api/relay/:orderId` routes are tracked gaps that must be migrated compatibly.
5. **Transactional Integrity**: All new or modified multi-step writes (order creation, status transitions, cart checkouts, driver reassignments) must use a MySQL transaction (`START TRANSACTION ... COMMIT / ROLLBACK`) and appropriate row locks/constraints. Do not treat the current non-transactional transition helpers as an acceptable precedent.
6. **Dual Currency Handling**: All financial records support USD and LBP. The seeded rate is `89,500 LBP/USD`. Checkout summaries and dashboard headers must represent both currencies accurately.

---

## 9. AI Architecture & Conversational Rules

### Core Architectural Principle
> **AI interprets. The application decides.**

```text
Customer WhatsApp Message
        ↓
Gemini AI (Interprets intent, entities, language, nuance)
        ↓
Structured Tool Call (Schema-validated function & arguments)
        ↓
AiToolsExecutor (Calls typed backend business services)
        ↓
MySQL / Redis (Executes verified queries & state transitions)
        ↓
Verified Result / Data
        ↓
Gemini AI Response (Grounds natural response in real data)
```

### AI Authorities & Boundaries:
- **AI MAY**: Detect intent, extract product queries, extract quantities, recognize budget limits, identify dietary preferences, resolve language/script, suggest clarification questions, summarize management queries.
- **AI MUST NEVER BE AUTHORITATIVE FOR**:
  - Product prices or discounts
  - Merchant open/closed status or branch availability
  - Delivery fees or surge pricing
  - Cart totals or order totals
  - Order state transitions
  - Driver assignment or ownership
  - Financial balances, ledger entries, or settlements
  - User roles or security permissions

### Conversation-State Rules:
- Persist the authoritative conversation state outside the model: active/search context, presented options, merchant, carts, selected address, budget, pending clarification, checkout-summary fingerprint, and active order.
- Redis may accelerate session state and locking, but MySQL-backed records/history remain the recoverable source of truth. A model transcript or a stored language preference must never override the latest inbound message or verified application state.
- Any ambiguous target, contradictory instruction, stale summary, or unresolved merchant switch blocks mutation until the customer clarifies or explicitly approves the next action.
- Keep customer messages concise and WhatsApp-friendly; do not expose internal IDs, raw tool errors, or provider details in model output.

### Memory, Learning, and Privacy Rules:
- Treat a one-off preference or inferred fact as a scoped suggestion, not a durable customer truth. Only evidence-backed, customer-confirmed memory may influence future-account behavior; corrections, conflicts, expiry, consent withdrawal, and deletion must propagate to every projection.
- Never train on raw production chats, addresses, phone numbers, GPS coordinates, media, names, provider IDs, or unconsented data. Redact before curation, record consent/review/provenance, quarantine uncertain records, and provide erase handling with auditable lineage.
- A customer message can never directly change global aliases, prompts, tool schemas, model routing, or model weights. Global learning requires human-reviewed cases, locked evaluation, shadow/canary evidence, durable rollout configuration, and immediate rollback.

### Mandatory Conversational Rules:
1. **Catalog Miss Rule (Exact Text Required)**:
   When an item is absent from the catalog, the assistant **must** reply with this exact text:
   > *"I couldn't find that within my current catalog. Do you want to choose another item or try a different name?"*
   Never invent a substitute or add a nearby item without explicit customer approval.
2. **Clarification Before Guessing**:
   If a request is ambiguous, contradictory, or underspecified (e.g., customer says "large" when both a meal and a drink are in the cart), the assistant **must not guess**. It must ask a concise clarifying question with clear options.
3. **Sender-Language Consistency**:
   The assistant detects the language and script of the **latest sender message** on every turn and responds in that language:
   - Lebanese Arabizi (e.g. `bade crispy chicken`) → Arabizi reply (`Tekram, 3andna...`)
   - Arabic script (e.g. `بدي كرسبي`) → Arabic script reply (`تكرم، طلبك...`)
   - English → English reply
   - Mixed Arabic/English → natural mixed reply
   - Stored preferences must **never** override the language of the current incoming message.
4. **Concise Token Budget**:
   Customer Gemini responses are capped at a maximum of 600 tokens (`GEMINI_MAX_OUTPUT_TOKENS=600`) to maintain sub-second response times.
5. **Read-Only vs. Mutation Separation**:
   Read-only search queries must not create or modify cart rows. Shadow-mode AI candidate runs must execute with `shadowMode=true`, guaranteeing **zero mutations** (0 carts, 0 orders, 0 addresses, 0 messages).
6. **Plain Customer Output**:
   Customer-facing replies must be concise plain text in the latest sender's language/script. Do not emit Markdown markers, lion branding/decorative emoji, internal IDs, raw error detail, or an invented business fact.
7. **Outcome-Specific Failures**:
   Apply the exact catalog-miss text only to a true catalog product miss. Address misses, cart-item/variant misses, no-active-order results, ambiguous messages, and provider failures must keep their own verified response category and next action; never route them through a generic product-search fallback.

---

## 10. WhatsApp Business Platform Rules

1. **Official Meta Cloud API**: All real inbound/outbound communication flows through Meta Graph API (`v25.0`).
2. **Signature Verification**: Every incoming webhook POST must verify the `x-hub-signature-256` header against `WHATSAPP_APP_SECRET`.
3. **Idempotent Webhook Processing**:
   - Webhook events are logged to `integration_webhook_events`.
   - Repeated delivery of the same `provider_message_id` must immediately return HTTP 200 and exit without re-processing business actions.
4. **Environment Mode Boundaries**:
   - `WHATSAPP_MODE=LIVE`: Requires valid `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. Fails fast at startup if missing.
   - `WHATSAPP_MODE=MOCK`: Uses the local simulator endpoint (`/api/conversations/message`) for automated tests and offline demonstrations.
   - **Never claim mock delivery is real delivery**.
5. **Media Pipeline**:
   - Audio voice notes (`audio/ogg; codecs=opus`) are downloaded, converted, and transcribed into normalized text preserving conversation context.
   - Vision images (shopping lists, dish photos) are analyzed and grounded against catalog items.
   - Enforce a 16MB file ceiling on all incoming media attachments.

---

## 11. Customer Privacy Rules

1. **Masked Communication Relay**:
   - The driver **never** sees the customer's real phone or WhatsApp number.
   - The customer **never** sees the driver's personal phone or WhatsApp number.
   - All communication passes through the Lion Delivery masked relay (`/api/relay/:orderId/messages`).
2. **Actor Authorization on Relay**:
   - The authenticated session (`req.user`) determines actor identity. Client-supplied `senderRole` or `customerId` headers are ignored.
   - Customers can only access relay channels for their own orders; drivers can only access channels for their actively assigned orders. Unauthorized access returns HTTP 403.
3. **Relay Lifecycle Requirement**:
   - A relay channel must open only when a driver is assigned and automatically expire/lock 30 minutes after delivery.
   - The current implementation can create a channel at checkout or on first message and has no verified expiry/lock worker. Treat this as an unresolved gap, not a completed privacy control.

### Driver Workflow Rules

4. **Driver Workflow Simplicity**:
   The driver interface remains intentionally minimal:
   ```text
   ACCEPT → REJECT → PICKED UP → DELIVERED → CHAT → CALL → REPORT ISSUE
   ```
   Do not add complex multi-step forms or heavy sub-apps to the driver experience.

---

## 12. Order State Machine & Concurrency Rules

1. **Canonical State Transitions**:
   New/refactored flows must follow the strict state graph (with explicitly documented compatibility mapping for already-persisted legacy values):
   ```text
   DRAFT
     ↓
   PENDING_CUSTOMER_CONFIRMATION
     ↓
   CONFIRMED
     ↓
   WAITING_FOR_MERCHANT
     ↓
   MERCHANT_ACCEPTED
     ↓
   PREPARING
     ↓
   READY_FOR_PICKUP
     ↓
   WAITING_FOR_DRIVER
     ↓
   DRIVER_ASSIGNED
     ↓
   PICKED_UP
     ↓
   ON_THE_WAY
     ↓
   DELIVERED
   ```
   Terminal / Exception States: `MERCHANT_REJECTED`, `DRIVER_REJECTED`, `CANCELLED`, `FAILED`, `REFUNDED`.
2. **Checkout Safety Invariants**:
   Order creation requires:
   - Explicit customer confirmation (no automatic checkout on "yes" without a summary).
   - Conversation stage must be `AWAITING_CONFIRMATION`.
   - Matching checkout summary fingerprint.
   - Revalidation of product prices and branch availability inside a MySQL transaction.
3. **Concurrency & Race Condition Defenses**:
   - **Idempotency Keys**: Exactly-once order creation is guaranteed by durable keys in `idempotency_keys`.
   - **Driver Assignment**: Race conditions where two drivers accept the same order must be prevented by a transaction, `SELECT ... FOR UPDATE`, and database constraints. The current `driverAccept` path is not yet transaction/row-lock protected, so it must not be used as a precedent.
   - **Customer Confirmation**: Duplicate confirmation taps or webhook retries do not spawn duplicate orders.
   - **Actor Binding**: Merchant and driver transitions must verify that `req.user` owns the merchant/driver resource for the target order. Never accept a driver or merchant identity from the request body as authority; current order transition controllers require this hardening.

---

## 13. Future Delivery Office Multi-Tenancy Rules

When extending the platform toward multi-tenancy:
1. **Tenant as Security Boundary**: Tenant isolation must be enforced in backend database queries (e.g. `WHERE tenant_id = ?`). Never rely on frontend filtering.
2. **Isolated Resources per Tenant**:
   - Users and Operators
   - WhatsApp Phone Number IDs & Meta WABA accounts
   - Customer records & conversation threads
   - Driver fleets & dispatch queues
   - Orders & live operational dashboards
   - Financial ledgers, cash reconciliations, settlements
   - Analytics & Management AI contexts
   - WebSocket subscriptions/events and private-media access
3. **Shared Global Merchant Model**:
   ```text
   GLOBAL MERCHANT (Name, Brand, Canonical Products, Master Menus)
         ├── Branches (Physical coordinates, addresses)
         └── Tenant Relationship (Lion Delivery Tenant)
               ├── Status (Active / Paused)
               ├── Commission Rate & Type (e.g., 15% Percentage)
               ├── Delivery Zones & Radius
               ├── Branch Availability Overrides
               └── Settlement Terms
   ```
   Do not hardcode tenant ownership directly on global catalog products. Use relational link tables (`tenant_merchant_relationships`).

### Merchant Model Rules

- Keep `merchants`, `merchant_branches`, canonical products, menus, and catalog metadata reusable at the global level where practical.
- Model a delivery-office contract through `tenant_merchant_relationships`, with tenant-specific status, commission, settlement terms, priority, delivery zones, availability overrides, and promotions.
- Do not “solve” tenant support by duplicating global merchants/products per office or adding an unscoped tenant ownership field to the catalog. Tenant scoping belongs in relationship-aware data access.

---

## 14. Finance & Historical Data Rules

1. **Immutable financial truth**: Completed orders retain their recorded subtotal, discounts, delivery/service fees, grand total, merchant total, commission, driver amount, currency, payment state, and financial snapshot. Never recompute historical truth from current catalog prices.
2. **Transactional money movement**: Cash collection, refunds, ledger entries, merchant/driver balances, reconciliation, and settlements require one transaction, durable idempotency, authorization, and an audit record. External callbacks must be replay-safe.
3. **Dual currency**: Preserve explicit USD/LBP amounts and the exchange-rate context used for a transaction. The seeded demo rate is 89,500 LBP/USD; never silently convert or overwrite historical currency values.
4. **Demo boundary**: Finance screens or fixture COD reconciliation do not establish a production finance/settlement engine. Do not claim financial completion until the ledger, refunds, settlements, authorization, and reconciliation acceptance tests are complete.

---

## 15. Security Rules

1. Enforce authentication, role permission, resource ownership, and future tenant scope in the backend/data-access layer; hidden UI controls are not authorization.
2. Validate every request body, route parameter, query, and AI tool payload before business logic. Use Zod schemas in `backend/src/shared/schemas.ts` and fail safely with 400/401/403 rather than raw implementation errors.
3. Treat WebSockets and media as protected interfaces: authenticate the socket handshake, authorize every subscription/event by role/resource/tenant, and use expiring private-media access. Never globally broadcast customer, relay, order, or tenant data.
4. Verify Meta webhook signatures, deduplicate provider IDs, rate-limit public endpoints, use parameterized SQL, and keep secrets in environment/secret management—not source, browser bundles, logs, or docs.
5. Audit sensitive actions (refunds, impersonation, credential changes, role changes, private-media/recording access, customer-memory deletion, and manual overrides). Do not leak SQL, stack traces, provider responses, PII, or internal IDs to customers.

---

## 16. Phase Execution & Existing-Code Protection

1. Every phase follows: **ANALYZE → IMPLEMENT → TEST → AUDIT → FIX → REGRESSION TEST → VERIFY → MARK COMPLETE**. Read its plan scope, business requirements, schema, existing module, dependencies, and acceptance tests before editing.
2. A phase report must name what changed, tests run and results, remaining external boundaries, and the exact business flow verified. A passing build, an existing file, a mocked screen, or a single happy path is never enough.
3. Search for and extend the existing service/component/module before creating a new one. Never introduce duplicate “replacement” modules such as `OrderService2`, `NewOrderService`, or `OrderServiceFinal`.
4. Preserve tested behavior and user changes. Refactor only with a clear reason, focused tests, and updated documentation. When touching legacy code that puts SQL in a controller or omits validation/transactions, move toward the approved layer boundary instead of reproducing the shortcut.

---

## 17. Testing & Regression Rules

1. **Mandatory Test Coverage for Every Feature**:
   - Happy path
   - Invalid input & boundary validation (400 responses)
   - Unauthorized & unauthenticated access (401/403 responses)
   - Duplicate action & idempotency verification
   - External provider failure & safe degradation
2. **Master Test Runner (`npm test`)**:
   - Executes 15 comprehensive suites sequentially.
   - Runs against an **isolated disposable database** (`lion_delivery_test_<pid>_<timestamp>`) and **Redis DB 15**.
   - Cleans up and drops the test database automatically upon completion.
   - **Never leaves test garbage or corrupts the shared demo database**.
3. **Zero In-Memory Persistence Mocks for Core State**:
   All core data assertions (orders, carts, addresses, customer memory, audit logs) must be asserted against real MySQL tables and Redis instances.
4. **No Regression Rule**:
   After modifying any code, future agents must run the relevant test suite and verify that existing suites continue to pass 100%.

---

## 18. No-Placeholder & Definition of Done Rules

### What Does NOT Count as Complete:
- `// TODO: implement later` in production paths
- Hardcoded demo numbers, fixed order totals, or static analytics fallbacks
- Canned AI replies that do not query the catalog or database
- Buttons in the UI that do not trigger backend API calls
- Mock-only API controllers with no database persistence
- Claiming live WhatsApp or live cloud vision is verified when running in local MOCK/FIXTURE mode

### Definition of Done (DoD):
A phase, module, or user story is **DONE** only when:
1. Database tables and migrations are in place and tested.
2. Backend routes, Zod schemas, controllers, and services are fully implemented.
3. Dashboard UI renders real data, handles all states (loading/empty/error), and synchronizes via WebSockets.
4. Authentication, role checks, and resource ownership are enforced; tenant boundaries are enforced for any tenant-aware feature.
5. All automated unit, integration, and regression tests pass cleanly.
6. TypeScript builds (`npm run build`) without errors.
7. Dashboard linter (`npm --prefix dashboard run lint`) passes with zero errors.
8. Documentation and walkthrough files are updated with verifiable evidence.

---

## 19. Context / Implementation Gaps (Discovered & Tracked)

The following architectural and documentation gaps were detected during repository analysis and must govern future work:

| Domain | Current repository reality | Documented / intended direction | Guardrail for agents |
|---|---|---|---|
| **Schema count and migration history** | The committed SQL has 139 table declarations and 5 views, while README/older docs cite 121 tables. It also contains later order-batch and AI-learning additions, and `ensure-ai-learning-tables.ts` provisions schema at startup. | Immutable baseline plus forward migrations. | Do not repeat baseline edits or ad-hoc startup schema creation. Use a named migration, document the count discrepancy, and test migration paths. |
| **Multi-tenancy** | Schema and data access are currently single-tenant: no `tenants`, `tenant_id`, or `tenant_merchant_relationships` exist. | Lion Delivery becomes the first delivery-office tenant in a SaaS platform. | Do not hardcode Lion as the only company. When tenants are introduced, scope every query, media URL, WebSocket event, cache key, and authorization decision server-side. |
| **Merchant model** | Merchants/branches and catalog entries are directly connected to orders without a tenant relationship layer. | Reusable merchant master plus per-tenant commercial/operational relationship. | Add `tenant_merchant_relationships` rather than cloning merchants/products or putting unscoped tenant ownership on global catalog data. |
| **Public identifiers / IDOR** | Several public routes still take numeric internal order and relay IDs. | Public APIs and dashboard links should use UUID/business identifiers. | Do not add more numeric public selectors; plan compatible public-ID routes and resource ownership checks. |
| **WebSocket authorization** | `backend/src/services/websocket.ts` accepts every `/ws` connection without authentication and broadcasts every event to every client. | Authenticated, scoped real-time streams. | Treat WebSocket auth/subscription filtering as a P0 security prerequisite before production or tenant work; never broadcast private/order/relay payloads globally. |
| **Order actors and concurrency** | Order controllers role-gate routes but do not bind merchant/driver operations to `req.user`; `driverAccept` accepts a body `driverId` and lacks a transaction/row lock. | Resource-authorized, race-safe state transitions. | Bind actors to the assigned resource, use transactions and `FOR UPDATE`, and test concurrent acceptance/duplicate events before claiming dispatch safety. |
| **Relay lifecycle** | REST relay access derives customer/driver identity from the authenticated session, but channels can be created before assignment or with a fallback driver and have no verified post-delivery expiry/lock. | Active-delivery-only masked channel with a timed post-delivery grace period. | Preserve the REST authorization pattern, close the lifecycle gap, and include relay data in WebSocket authorization—not global broadcast. |
| **Dashboard session and real-time fallback** | `App.tsx` auto-logs in with local demo credentials and stores JWTs in `localStorage`; `LiveOrders` has polling, while `RelayChat` has reconnect but no verified 8-second polling fallback. | Real operator authentication and resilient scoped live updates. | Do not embed credentials in browser code or treat all current UI role labels as authoritative. Add/review loading, error, empty, retry, auth, and polling behavior whenever touching a live view. |
| **External providers** | Local behavior intentionally uses `WHATSAPP_MODE=MOCK` and `MEDIA_MODE=FIXTURE`; live Meta/Whisper/Vision/Gemini verification depends on external credentials, test numbers, and human review. | Live provider deployments with explicit fail-closed behavior. | Never represent fixture/mock results as real delivery or model/media verification. Preserve `validateStartupConfig` and document every external pending boundary. |
| **AI learning and quality claims** | Durable learning, redaction, dataset, evaluation, and routing code exists, but live fine-tuning/candidate evaluation remains credential-dependent and historical audit reports contain superseded or conflicting claims. | Human-reviewed datasets and safely measured Gemini shadow/canary rollout. | Revalidate the actual runtime path and isolated tests before claiming model quality. Shadow execution must remain zero-mutation, datasets must be redacted/consented, and deterministic metrics are not live-model evidence. |
| **Catalog-miss policy** | `walkthrough.md` and current AI contracts require one exact generic sentence for a true catalog miss; the customer-conversation plan recommends richer named-item alternatives and outcome-specific error text. | Helpful, context-specific customer recovery without invented inventory. | Preserve the exact product catalog-miss contract until an explicit product decision and regression update change it. Already-known address/cart/variant/order failures must use their own response categories, never that catalog-miss fallback. |
| **Documentation and test-status drift** | `README.md` still describes 10 master suites/121 tables while `test-all.ts` currently runs 15 suites; technical documents include suggested libraries/structure not present in the implementation. | Documentation should describe the live repository and verified boundaries. | Update README/walkthrough/AGENTS whenever behavior or commands change; distinguish architecture targets from code that exists today. |
| **LiveKit calling** | Private calling/recording is planned but not wired into the demo dashboard. | Authorized LiveKit bridge, recording, and consent-aware retention. | Do not let calling block the demo, but do not claim it exists or expose contact identities as a substitute. |

---

## 20. Essential Commands for Future Agents

Use these commands from the repository root. They are present in the current package manifests; choose focused suites first, then run the relevant master/build checks before claiming completion.

### 1. Build & Compilation
```bash
# Full project production build (both backend & dashboard)
npm run build

# Backend TypeScript check only
npm --prefix backend run build

# Dashboard TypeScript & Vite bundle check
npm --prefix dashboard run build

# Dashboard linter (Oxlint)
npm --prefix dashboard run lint
```

### 2. Testing & Verification
```bash
# Master integration test runner (15 suites against disposable MySQL & Redis DB 15)
npm test
# OR
npm --prefix backend run test:all

# Specific focused test suites
npm --prefix backend run test:api           # Real HTTP API & Auth integration tests
npm --prefix backend run test:webhook       # WhatsApp webhook signature & deduplication
npm --prefix backend run test:ws            # WebSocket live broadcasting & envelope tests
npm --prefix backend run test:failures      # State machine guards & idempotency tests
npm --prefix backend run test:conversations # 15 Conversational AI multi-turn test scenarios
npm --prefix backend run test:rehearsal     # 3x consecutive full demo rehearsals
npm --prefix backend run demo:backup        # Resilient kitchen-rejection backup demo scenario
npm --prefix backend run test:config-matrix # Startup config & provider boundary matrix
npm --prefix backend run test:gemini        # Gemini 3.8 Flash integration suite
npm --prefix backend run test:demo-gaps     # DG-001–DG-008 regression suite
npm --prefix backend run test:browser       # Browser dashboard Puppeteer E2E rehearsal (3x)
npm --prefix backend run test:ai-plan       # 12 AI training & self-learning audit suites
npm --prefix backend run test:eval          # AI deterministic evaluator (23 records)
npm --prefix backend run test:search-quality # Catalog search NDCG & basket comparison
npm --prefix backend run test:language      # Sender-language consistency suite
npm --prefix backend run test:contract      # AI behavior contract and tool-schema suite
npm --prefix backend run test:datasets      # Dataset/provenance validation suite
npm --prefix backend run test:telemetry     # Telemetry redaction/failure telemetry suite
npm --prefix backend run test:shadow-immutability # Shadow-mode zero-mutation suite
npm --prefix backend run test:evaluator-safety # Evaluator safety/exact-typing suite
npm --prefix backend run test:ai-learning-e2e # Continuous-learning E2E suite
```

### 3. Database & Demo State Operations
```bash
# Reset demo state to pristine baseline (verifies 10 exact invariant assertions)
npm run demo:reset

# Seed demo dataset (merchants, branches, products, drivers, customers)
npm run demo:seed

# Initialize fresh database schema
npm run db:init
```

### 4. Running the Full Platform Locally
```bash
# Terminal 1: Backend API & WebSocket Server (localhost:4050)
npm run dev:backend

# Terminal 2: React Dashboard (localhost:5173)
npm run dev:dashboard
```

### 5. Operator Credentials for Local Testing
- **URL**: `http://localhost:5173`
- **Role**: Superadmin Operator
- **Email**: `admin@liondelivery.com`
- **Password**: `admin123` (PBKDF2 hashed in database)
