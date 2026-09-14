# Lion Delivery
## Full Master Implementation Plan
### React + Vite + TypeScript | Node.js + TypeScript | MySQL
### WhatsApp-First AI-Assisted Delivery Operations Platform

---

# 1. Master Goal

Build Lion Delivery from the existing business, technical, and database specifications into a complete production-ready delivery operations platform.

The project is complete only when the full business journey works reliably from end to end:

```text
CUSTOMER WHATSAPP
        ↓
AI UNDERSTANDING
        ↓
PRODUCT / MERCHANT SEARCH
        ↓
CART
        ↓
ADDRESS
        ↓
ORDER CONFIRMATION
        ↓
MERCHANT
        ↓
DRIVER DISPATCH
        ↓
PICKUP
        ↓
PRIVATE COMMUNICATION / CALLING
        ↓
DELIVERY
        ↓
PAYMENT / CASH
        ↓
SETTLEMENT
        ↓
SUPPORT
        ↓
ANALYTICS
        ↓
MANAGEMENT DASHBOARD + MANAGEMENT AI
```

No phase should be marked complete because code exists.

A phase is complete only when:

- required database structures exist
- backend APIs work
- frontend/dashboard behavior works where applicable
- integration behavior works where applicable
- permissions are enforced
- error cases are handled
- automated tests pass
- manual acceptance tests pass
- previous completed phases still work
- documentation is updated
- no critical or high-severity unresolved defect remains

---

# 2. Source of Truth

Implementation must follow all three approved project artifacts:

1. `Lion_Delivery_Full_Business_Documentation.md`
2. `Lion_Delivery_Full_Technical_Documentation.md`
3. `Lion_Delivery_Full_MySQL_Database.sql`

If implementation details conflict:

1. Business rules take priority for expected behavior.
2. Technical documentation defines architectural intent.
3. Database schema defines the initial persistence model.
4. Any required schema change must be made through a migration, never by silently changing production data.

---

# 3. Core Technology Stack

## Dashboard

```text
React
Vite
TypeScript
React Router
TanStack Query
WebSocket / Socket.IO client
Charting library
Form validation library
Component / styling system
```

## Backend

```text
Node.js
TypeScript
Express.js or Fastify
REST API
WebSocket / Socket.IO
MySQL 8+
Redis
BullMQ or equivalent background queue
```

## Integrations

```text
Official Meta WhatsApp Business Platform / Cloud API
AI provider abstraction
LiveKit
Object storage
Maps / geocoding provider
```

## Infrastructure

```text
Linux
Nginx
HTTPS
Process manager or containers
MySQL
Redis
Object storage
Monitoring
Backups
```

---

# 4. Project-Wide Non-Negotiable Rules

## 4.1 Business Truth

AI must never become the source of truth for:

- prices
- product availability
- merchant availability
- delivery fee
- order total
- merchant settlement
- driver settlement
- refunds
- permissions
- order ownership

These values must come from backend services and persistent business data.

## 4.2 No Customer Mobile App

The customer experience is WhatsApp-first.

The customer must be able to:

- search
- order
- manage address
- confirm
- track
- contact support
- communicate with the driver

without a customer Flutter application.

## 4.3 Driver Simplicity

The initial driver experience must remain limited to:

```text
ACCEPT
REJECT
PICKED UP
DELIVERED
CHAT CUSTOMER
CALL CUSTOMER
REPORT ISSUE
```

Do not turn the driver flow into a large application unless a later business requirement explicitly changes this.

## 4.4 Privacy

Customer and driver personal phone numbers must not be exposed to each other.

Private delivery communication must be routed through Lion Delivery.

## 4.5 Idempotency

All external events and critical write operations must tolerate duplicates.

## 4.6 Transactional Finance

Financial changes must be transactional and auditable.

## 4.7 RBAC

Every protected backend operation must independently enforce permissions.

Frontend hiding is not security.

## 4.8 Production Safety

No phase may introduce breaking changes to previously accepted phases.

---

# 5. Environments

Create three environments from the beginning:

```text
LOCAL
STAGING
PRODUCTION
```

Each environment must have separate:

- database
- Redis
- object-storage namespace
- secrets
- WhatsApp configuration where supported
- AI configuration
- LiveKit configuration
- logs

Production credentials must never be used for local testing.

---

# 6. Branching and Release Strategy

Recommended branches:

```text
main
develop
feature/*
fix/*
release/*
```

Recommended release flow:

```text
feature branch
    ↓
pull request
    ↓
lint
type check
tests
    ↓
develop
    ↓
staging deployment
    ↓
acceptance testing
    ↓
release
    ↓
production
```

---

# 7. Phase Execution Rule

Every phase follows this cycle:

```text
1. Review phase scope
2. Review relevant database tables
3. Create migrations if required
4. Build backend
5. Build dashboard/UI if required
6. Integrate external services if required
7. Write tests
8. Run phase tests
9. Run regression tests
10. Manual acceptance test
11. Fix all critical/high defects
12. Update documentation
13. Mark phase complete
14. Continue
```

Do not skip step 9.

---

# 8. Phase 0 — Project Audit and Implementation Baseline

## Objective

Establish the exact starting state before feature development.

## Tasks

- Create repository structure.
- Confirm Node.js version.
- Confirm MySQL version.
- Confirm TypeScript versions.
- Confirm package manager.
- Confirm React/Vite setup.
- Confirm backend framework.
- Load and validate the full SQL schema.
- Compare business documentation against technical documentation.
- Compare technical documentation against database schema.
- Record any missing tables, fields, workflows, or contradictions.
- Create implementation backlog.
- Create traceability matrix from business requirement → module → API → UI → test.

## Deliverables

- repository initialized
- backend project initialized
- dashboard project initialized
- schema imports successfully
- environment templates
- project README
- implementation backlog
- traceability matrix

## Tests

```text
frontend installs
frontend builds
backend installs
backend builds
database schema imports on empty MySQL
database can be reset cleanly
environment validation works
```

## Exit Gate

Phase 0 is complete only if the entire project can be installed from scratch using documented commands.

---

# 9. Phase 1 — Core Backend Foundation

## Objective

Create the production-quality backend foundation that all later modules depend on.

## Backend Tasks

Build:

- app bootstrap
- HTTP server
- environment configuration
- centralized configuration service
- dependency initialization
- MySQL connection
- Redis connection
- request IDs
- structured logging
- global error handler
- API response standard
- validation middleware
- health endpoints
- readiness endpoints
- graceful shutdown
- API versioning

Recommended endpoints:

```text
GET /health
GET /ready
GET /api/v1/version
```

## Shared Standards

Define:

- error codes
- pagination standard
- date/time standard
- money representation
- public IDs
- internal IDs
- API naming
- logging fields

## Deliverables

- stable backend shell
- database repository pattern
- service pattern
- controller pattern
- validation pattern
- typed errors

## Tests

- database connection failure
- Redis connection failure
- invalid environment
- validation errors
- unknown route
- internal server error formatting
- health check
- graceful shutdown

## Exit Gate

Backend foundation must be reusable without duplicating error, validation, or database logic in later modules.

---

# 10. Phase 2 — Dashboard Foundation

## Objective

Create the complete frontend shell before business modules are added.

## Tasks

Build:

- application router
- authenticated layout
- navigation
- top bar
- sidebar
- loading states
- error boundaries
- API client
- TanStack Query configuration
- global notification/toast system
- reusable tables
- filters
- pagination
- modal/dialog system
- forms
- role-aware navigation
- responsive base layout
- WebSocket client foundation

## Base Routes

```text
/login
/dashboard
/orders
/live-operations
/conversations
/customers
/merchants
/catalog
/drivers
/dispatch
/support
/promotions
/finance
/settlements
/analytics
/reports
/management-ai
/users
/roles
/settings
/audit
```

Pages may initially contain placeholders but routes and permission structure must be ready.

## Tests

- build
- routing
- protected routes
- unauthorized route behavior
- global API error behavior
- query retry behavior
- logout behavior

## Exit Gate

Dashboard shell works cleanly and future modules can plug into it without reworking navigation or architecture.

---

# 11. Phase 3 — Authentication, Users, Roles, Permissions, Audit

## Objective

Secure the internal dashboard before operational data becomes accessible.

## Backend

Implement:

```text
users
roles
permissions
user_roles
role_permissions
user_sessions
audit_logs
```

Functions:

- login
- logout
- refresh session
- current user
- password change
- role assignment
- permission assignment
- session revoke
- user enable/disable

## Dashboard

Build:

- login
- user management
- role management
- permission matrix
- current sessions
- audit history viewer

## Security

Implement:

- password hashing
- secure refresh tokens
- login throttling
- session expiry
- secure cookies if used
- token revocation
- permission middleware

## Tests

For every protected module verify:

```text
unauthenticated → rejected
authenticated without permission → rejected
authenticated with permission → allowed
```

## Exit Gate

No operational endpoint may be created later without a defined permission.

---

# 12. Phase 4 — Delivery Zones and Merchant Foundation

## Objective

Create the supply-side structure required before product search exists.

## Backend

Implement:

```text
delivery_zones
merchants
merchant_branches
merchant_contacts
merchant_operating_hours
merchant_special_hours
merchant_branch_delivery_zones
merchant_status_history
```

Business operations:

- create merchant
- update merchant
- enable/disable merchant
- create branch
- assign delivery zones
- operating hours
- holiday/special hours
- merchant pause/resume

## Dashboard

Build:

- merchant list
- merchant profile
- branches
- delivery areas
- opening hours
- contacts
- merchant status
- merchant history

## Tests

- branch outside zone
- closed merchant
- paused merchant
- special closed date
- delivery fee override
- merchant with multiple branches

## Exit Gate

Backend can answer:

```text
Is this branch open?
Does this branch serve this delivery area?
What delivery fee/rule applies?
```

reliably.

---

# 13. Phase 5 — Catalog, Products, Pricing, Availability

## Objective

Create the authoritative product catalog used by customer search and ordering.

## Backend

Implement:

```text
categories
products
product_aliases
product_images
product_variants
product_addons
product_allowed_addons
merchant_products
merchant_product_variants
merchant_product_addons
merchant_product_price_history
merchant_product_availability_history
```

Functions:

- categories
- canonical products
- merchant-specific products
- variants
- add-ons
- price updates
- availability
- stock where applicable
- featured items
- product media
- bulk import

## Dashboard

Build:

- categories
- products
- merchant catalog
- product editor
- variants
- add-ons
- pricing
- availability
- price history
- availability history
- bulk import

## Rules

All order/search prices must originate from merchant product pricing.

Never let AI-generated text become product master data automatically without approval.

## Tests

- inactive product excluded
- unavailable product excluded
- branch-specific pricing
- product variant pricing
- add-on pricing
- price history
- availability history

## Exit Gate

Catalog can support real menu/product data for multiple restaurants and supermarkets.

---

# 14. Phase 6 — Customer Profiles and Multimedia Addresses

## Objective

Create customer identity and address functionality before ordering.

## Backend

Implement:

```text
customers
customer_preferences
customer_addresses
customer_tags
customer_tag_assignments
customer_favorites
```

Customer identity key:

```text
WhatsApp phone number
```

Address must support:

- label
- written address
- coordinates
- landmark
- floor/apartment
- entrance photo
- voice directions
- transcription
- alternate recipient

## Dashboard

Build:

- customer list
- customer profile
- order summary
- saved addresses
- favorites
- tags
- notes

## Tests

- first customer creation
- existing customer lookup
- multiple addresses
- default address
- address media
- deleted/inactive address
- phrase-to-saved-address behavior later

## Exit Gate

Customer can exist independently of an order and maintain reusable delivery information.

---

# 15. Phase 7 — Media and Object Storage Foundation

## Objective

Securely support images, voice, video, recordings, and other private files.

## Build

Implement storage abstraction for:

- product images
- shopping-list images
- WhatsApp image attachments
- audio
- video
- address entrance photos
- voice address directions
- support media
- call recordings
- report exports

## Security

Implement:

- file size limits
- MIME allowlists
- random object names
- signed access URLs
- private buckets
- retention metadata
- malware/content scanning where appropriate
- download authorization

## Tests

- invalid MIME
- oversized upload
- signed URL expiry
- unauthorized access
- deleted/expired media
- storage provider failure

## Exit Gate

No later phase stores private files directly on the web server as unmanaged public files.

---

# 16. Phase 8 — WhatsApp Business Integration

## Objective

Connect the platform to the official Meta WhatsApp Business Platform.

## Backend

Implement:

```text
integration_webhook_events
conversations
conversation_participants
messages
message_media
conversation_state
notifications
```

WhatsApp flow:

```text
WEBHOOK
  ↓
SIGNATURE VERIFY
  ↓
IDEMPOTENCY CHECK
  ↓
STORE RAW EVENT
  ↓
NORMALIZE
  ↓
IDENTIFY PARTICIPANT
  ↓
STORE MESSAGE
  ↓
QUEUE PROCESSING
```

Support:

- text
- image
- audio
- video
- document
- location
- interactive replies
- delivery/read status

## Outbound

Build message service with:

- template messages
- service replies
- interactive buttons where supported
- retries
- delivery status
- failure logs

## Tests

- webhook verification
- invalid signature
- duplicate webhook
- inbound text
- inbound image
- inbound audio
- inbound video
- location
- outbound failure
- message status updates

## Exit Gate

A real WhatsApp message can enter staging, be stored once, and receive a valid outbound reply.

---

# 17. Phase 9 — AI Customer Conversation Engine

## Objective

Allow customers to communicate naturally while the backend retains deterministic control.

## Build AI Abstraction

Do not hardwire business logic to one model.

Create:

```text
CustomerAIProvider
DashboardAIProvider
```

## Customer AI Responsibilities

- detect intent
- detect language
- understand Arabic
- understand Lebanese Arabizi
- understand English
- interpret mixed language
- interpret images
- interpret audio
- interpret video
- extract products
- extract quantities
- extract budget/preferences
- detect ambiguity
- request clarification

## Structured Output

Use schema validation for AI output.

Example intents:

```text
SEARCH_PRODUCTS
SEARCH_MERCHANT
ADD_TO_CART
REMOVE_FROM_CART
UPDATE_CART
SELECT_RESULT
SAVE_ADDRESS
SELECT_ADDRESS
CHECKOUT
ORDER_STATUS
CANCEL_ORDER
REPEAT_ORDER
CONTACT_SUPPORT
UNKNOWN
```

## Conversation State

Implement deterministic state transitions.

Never let AI invent current cart or selected result from memory alone.

## Tests

Create a multilingual test corpus containing:

- Arabic
- English
- Arabizi
- mixed Arabic/English
- spelling errors
- Lebanese slang
- ambiguous requests
- image requests
- voice requests

## Exit Gate

AI output is always validated before business functions execute.

Invalid output must safely fall back to clarification or support.

---

# 18. Phase 10 — Search, Matching, Recommendation and Basket Comparison

## Objective

Let customers request products without knowing which merchant sells them.

## Build Search Pipeline

```text
query normalization
    ↓
exact match
    ↓
alias match
    ↓
language normalization
    ↓
full-text match
    ↓
semantic match
    ↓
merchant filter
    ↓
availability filter
    ↓
delivery-zone filter
    ↓
ranking
```

## Ranking Inputs

- relevance
- price
- delivery fee
- ETA
- merchant rating
- promotion
- distance
- availability
- customer preference

## Basket Comparison

For multi-item supermarket requests:

```text
requested items
    ↓
candidate matches
    ↓
group by merchant
    ↓
basket completeness
    ↓
item total
    ↓
delivery fee
    ↓
promotion
    ↓
final basket total
    ↓
rank
```

## Store Search Analytics

Implement:

```text
search_sessions
search_session_items
search_results
```

## Tests

- Arabizi alias
- Arabic alias
- English alias
- semantically similar product
- unavailable result removal
- merchant closed
- unsupported delivery area
- cheapest basket
- fastest option
- no result
- partial basket

## Exit Gate

Given known catalog data, search returns correct and reproducible merchant/product options.

---

# 19. Phase 11 — Cart and Checkout

## Objective

Convert customer selections into a deterministic order preview.

## Backend

Implement:

```text
carts
cart_items
cart_item_addons
```

Operations:

- create cart
- add item
- remove item
- change quantity
- select variant
- add add-on
- add notes
- calculate subtotal
- calculate discount
- calculate estimated delivery fee

## Checkout Revalidation

Before order confirmation:

```text
check merchant open
check availability
check current price
check variants
check delivery area
calculate delivery fee
apply promotion
calculate final total
```

If price changed:

- customer is informed
- confirmation must use new price

## Tests

- stale cart
- unavailable item
- changed price
- removed variant
- merchant closes before checkout
- invalid address
- promotion eligibility
- duplicate confirmation

## Exit Gate

No order can be created using stale or AI-invented totals.

---

# 20. Phase 12 — Order Engine

## Objective

Create the central order lifecycle.

## Backend

Implement:

```text
orders
order_items
order_item_addons
order_status_history
order_events
order_notes
order_cancellations
order_item_substitutions
order_alternative_offers
order_reviews
```

## State Machine

Enforce valid transitions.

Example:

```text
CONFIRMED
→ WAITING_FOR_MERCHANT
→ MERCHANT_ACCEPTED
→ PREPARING
→ READY
→ WAITING_FOR_DRIVER
→ DRIVER_ASSIGNED
→ PICKED_UP
→ ON_THE_WAY
→ DELIVERED
```

Alternative paths:

```text
MERCHANT_REJECTED
CANCELLED
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

## Dashboard

Build:

- order list
- order detail
- timeline
- order items
- address
- merchant
- driver
- payment
- notes
- communication shortcuts
- manual authorized actions

## Tests

- invalid status transition
- duplicate confirmation
- cancellation rules
- merchant reject
- substitution
- alternative merchant
- repeat order
- historical item snapshot

## Exit Gate

Order state is authoritative, fully auditable, and cannot enter impossible combinations.

---

# 21. Phase 13 — Merchant Order Workflow

## Objective

Connect confirmed customer orders to merchants.

## Merchant Actions

```text
ACCEPT
REJECT
PREPARING
READY
REPORT ITEM UNAVAILABLE
REPORT ISSUE
```

## Notifications

Send merchant order information through the selected operational channel.

## Rejection

If rejected:

```text
save reason
    ↓
search alternative
    ↓
calculate alternative price
    ↓
ask customer
    ↓
customer approves
    ↓
new order/merchant path
```

## Tests

- accept
- reject
- timeout
- merchant goes offline
- unavailable item
- alternative accepted
- alternative rejected

## Exit Gate

No merchant rejection leaves the order in an ambiguous state.

---

# 22. Phase 14 — Driver Management and Dispatch

## Objective

Automate safe driver assignment.

## Backend

Implement:

```text
drivers
driver_documents
driver_delivery_zones
driver_availability
driver_status_history
driver_locations
driver_offers
driver_assignments
driver_performance_daily
```

## Dispatch Logic

Filter by:

- active
- available
- delivery zone
- current workload
- distance
- restrictions

Rank candidates.

Send offer sequentially or according to configured strategy.

## Concurrency

Use:

- DB transaction
- distributed lock
- unique assignment rules

to prevent two drivers from owning the same order.

## Driver Actions

```text
ACCEPT
REJECT
PICKED_UP
DELIVERED
REPORT ISSUE
```

## Dashboard

Build:

- drivers
- availability
- current orders
- offer history
- assignment
- manual reassignment
- performance

## Tests

- two drivers accept at same time
- expired offer
- rejected offer
- driver goes offline
- manual reassignment
- duplicate pickup
- duplicate delivered action

## Exit Gate

Each active order has at most one active driver assignment.

---

# 23. Phase 15 — Private Customer ↔ Driver Messaging

## Objective

Allow communication while keeping both parties private.

## Backend

Implement:

```text
delivery_channels
delivery_messages
```

Flow:

```text
driver message
    ↓
Lion Delivery relay
    ↓
customer
```

Reverse flow identical.

## Support

- text
- image
- voice
- delivery-related media

## Rules

- channel tied to order
- opens only for active delivery
- driver/customer numbers never exposed
- channel closes after delivery + configured grace period
- operations can view history according to permission

## Dashboard

Build:

- delivery conversation viewer
- timestamps
- sender role
- media
- transcripts
- support intervention

## Tests

- driver sends text
- customer replies
- voice relay
- image relay
- expired channel
- wrong driver attempts message
- wrong customer
- post-delivery attempt

## Exit Gate

Privacy cannot be bypassed by normal communication flows.

---

# 24. Phase 16 — LiveKit Private Calling and Recording

## Objective

Enable private driver/customer voice calls.

## Build

Implement:

```text
delivery_calls
call_recordings
call_transcripts
```

## Flow

```text
CALL CUSTOMER / CALL DRIVER
        ↓
verify active delivery
        ↓
verify communication channel
        ↓
verify permission/consent
        ↓
create call room/session
        ↓
connect parties
        ↓
record if policy permits
        ↓
end
        ↓
store metadata
        ↓
process recording
        ↓
optional transcript
```

## Dashboard

Show:

- call time
- direction
- status
- duration
- recording status
- recording playback for authorized users
- transcript for authorized users

## Tests

- invalid order
- channel expired
- call permission denied
- connect
- disconnect
- recording
- failed recording
- provider outage
- unauthorized playback

## Exit Gate

Calling failure never prevents order completion and recordings cannot be accessed without permission.

---

# 25. Phase 17 — Customer Support and Human Takeover

## Objective

Give Lion Delivery operational control when automation is insufficient.

## Backend

Implement:

```text
support_cases
support_messages
support_notes
support_actions
complaints
```

## Case Types

- late order
- missing item
- wrong item
- damaged item
- merchant issue
- driver issue
- cancellation
- refund
- payment
- address
- general complaint

## AI Handoff

```text
AI detects escalation
    ↓
create case
    ↓
switch conversation to HUMAN
    ↓
assign support
    ↓
agent responds
    ↓
resolve
    ↓
close
```

## Dashboard

Build unified support inbox.

## Tests

- AI handoff
- manual takeover
- return to AI
- agent reassignment
- order-linked complaint
- escalation
- closure

## Exit Gate

A support agent can take over without AI simultaneously replying.

---

# 26. Phase 18 — Finance Ledger and Cash Management

## Objective

Make every monetary movement traceable.

## Implement

```text
financial_accounts
financial_transactions
financial_entries
order_financials
payment_transactions
merchant_balances
driver_balances
cash_reconciliations
cash_reconciliation_items
```

## Order Completion

Create immutable order financial snapshot:

```text
subtotal
discount
delivery fee
service fee
tax
grand total
merchant amount
company commission
driver earning
```

## Ledger

Use double-entry style entries or equivalent balanced ledger discipline.

## Cash

Track:

```text
cash customer paid
cash driver holds
cash driver owes company
merchant payable
driver earning
```

## Tests

- completed cash order
- cancelled order
- partial refund
- driver liability
- reconciliation difference
- repeated financial event
- rollback on failure

## Exit Gate

Financial totals can be reconciled back to individual orders and ledger entries.

---

# 27. Phase 19 — Refunds, Compensation and Settlements

## Objective

Complete the financial lifecycle.

## Refunds

Implement:

```text
refunds
refund_items
```

Support:

- full refund
- partial refund
- item refund
- delivery fee refund
- compensation voucher

## Merchant Settlement

Implement:

```text
merchant_settlements
merchant_settlement_items
```

## Driver Settlement

Implement:

```text
driver_settlements
driver_settlement_items
```

## Authorization

Sensitive actions require explicit permissions.

## Tests

- refund approval
- duplicate refund
- refund greater than refundable amount
- merchant adjustment
- driver adjustment
- settlement period
- settlement payment
- closed settlement cannot silently mutate

## Exit Gate

A completed settlement remains historically reproducible.

---

# 28. Phase 20 — Promotions and Loyalty

## Objective

Implement growth and retention functionality without corrupting checkout totals.

## Implement

```text
promotions
promotion_merchants
promotion_branches
promotion_products
promotion_categories
promotion_customers
promotion_delivery_zones
promotion_redemptions
loyalty_accounts
loyalty_transactions
```

## Support

- percentage
- fixed
- free delivery
- first order
- product/category
- merchant
- area
- customer
- minimum spend
- voucher
- loyalty reward

## Tests

- expired
- future
- max uses
- per customer
- first order only
- minimum spend
- wrong merchant
- stacking rule
- refund impact

## Exit Gate

Promotion eligibility and resulting totals are deterministic and test-covered.

---

# 29. Phase 21 — Live Operations Dashboard

## Objective

Give operations a real-time command center.

## Dashboard

Display pipeline:

```text
NEW
WAITING FOR MERCHANT
ACCEPTED
PREPARING
READY
WAITING FOR DRIVER
DRIVER ASSIGNED
PICKED UP
ON THE WAY
DELIVERED
```

## Features

- live order board
- filters
- SLA timers
- delay indicators
- merchant response time
- driver status
- order details
- manual driver reassignment
- support shortcut
- conversation shortcut
- alerts
- authorized manual status action

## Real-Time Backend

Publish WebSocket events for important state changes.

## Tests

- new order appears live
- status changes
- reconnect
- missed event recovery
- permissions
- concurrent operators

## Exit Gate

Operations can manage active deliveries without refreshing the browser.

---

# 30. Phase 22 — Notifications, Alerts and Automation

## Objective

Automate predictable operational follow-up.

## Implement

```text
notifications
operational_alerts
automation_rules
automation_runs
outbox_events
failed_jobs
```

## Automations

Examples:

```text
merchant timeout
→ remind / alert

driver timeout
→ next driver

no driver
→ operations alert

order delayed
→ operations alert

delivered
→ rating request

bad rating
→ support case

daily close
→ report

settlement period
→ settlement preparation
```

## Reliability

Use outbox/queue so business transactions do not depend on immediate third-party success.

## Tests

- duplicate event
- retry
- failed job
- dead-letter behavior
- rule disabled
- alert resolved

## Exit Gate

Automation failures are visible and recoverable.

---

# 31. Phase 23 — Analytics Data Pipeline

## Objective

Create reliable management analytics without slowing operational queries.

## Implement Aggregates

```text
analytics_daily_orders
analytics_daily_customers
analytics_daily_merchants
analytics_daily_drivers
analytics_daily_products
analytics_daily_ai
analytics_daily_whatsapp
analytics_daily_finance
```

## Metrics

### Orders

- volume
- completion
- cancellation
- average basket
- preparation time
- delivery time

### Customers

- new
- returning
- repeat
- spend
- retention

### Merchants

- sales
- acceptance
- rejection
- preparation
- complaints

### Drivers

- offers
- acceptance
- rejection
- delivery time
- earnings

### Products

- searches
- orders
- no-result demand
- unavailable demand

### AI

- interactions
- clarifications
- failures
- cost
- human handoff

### WhatsApp

- chats
- messages
- modality
- conversion
- cost

### Finance

- GMV
- revenue
- commission
- payouts
- refunds
- costs
- profit

## Tests

Reconcile summary values against raw data for sample periods.

## Exit Gate

Every dashboard KPI has a documented formula and can be traced to source records.

---

# 32. Phase 24 — Analytics Dashboard and Reports

## Objective

Expose business performance to management.

## Build

Dashboard sections:

```text
Overview
Orders
Customers
Merchants
Drivers
Products
WhatsApp
AI
Finance
Support
```

## Reports

Implement exportable reports:

- daily operations
- weekly management
- monthly business
- revenue
- merchant
- driver
- customer
- cancellations
- complaints
- delivery performance
- product demand
- unavailable demand
- promotions
- refunds
- settlements
- communication cost
- profitability

## Tests

- date filtering
- area filtering
- merchant filtering
- export
- permissions
- totals reconciliation

## Exit Gate

Report values match source data and finance reconciliation.

---

# 33. Phase 25 — Management AI Assistant

## Objective

Give management natural-language access to authorized analytics.

## Default Rule

Read-only.

## Tool Set

Examples:

```text
getOrderMetrics
comparePeriods
getMerchantMetrics
getDriverMetrics
getCustomerMetrics
getProductDemand
getUnavailableSearches
getAIUsage
getWhatsAppUsage
getFinancialMetrics
getCancellationAnalysis
getSupportMetrics
```

## Prohibited

The management AI must not:

- execute arbitrary SQL
- issue refunds
- alter settlements
- change prices
- change permissions
- cancel orders
- modify customers

unless a future separately authorized action framework is created.

## Dashboard

Build persistent management chatbot panel.

## Tests

Questions:

```text
How many orders today?
Compare this week and last week.
Which merchant rejects the most?
Which products are searched but unavailable?
Why did cancellations increase?
What is today's revenue?
```

Verify answer against raw metrics.

## Exit Gate

Management AI cannot access data outside the authenticated user's permissions.

---

# 34. Phase 26 — Cost Tracking

## Objective

Allow Lion Delivery to know the real operating cost per chat and order.

## Implement

Use:

```text
ai_interactions
provider_cost_rates
analytics_daily_ai
analytics_daily_whatsapp
analytics_daily_finance
delivery_calls
```

Track:

- AI tokens
- AI media usage
- AI estimated cost
- WhatsApp outbound usage
- WhatsApp estimated cost
- call duration
- calling cost
- recording cost
- cost per conversation
- cost per completed order

## Tests

- provider rate effective date
- cost aggregation
- historical rate changes
- daily totals
- cost/order

## Exit Gate

Changing future provider rates does not rewrite historical cost estimates.

---

# 35. Phase 27 — Privacy, Security and Compliance Hardening

## Objective

Perform a dedicated security phase rather than treating security as incidental.

## Review

- authentication
- session management
- password policy
- RBAC
- object-storage privacy
- signed URLs
- phone masking
- call recording access
- customer address access
- audit coverage
- secrets
- CORS
- rate limiting
- webhook validation
- SQL injection
- XSS
- CSP
- file validation
- dependency vulnerabilities
- backup access

## Data Retention

Define policies for:

- WhatsApp media
- address voice notes
- delivery chat
- call recordings
- transcripts
- support attachments
- audit logs
- financial records

## Tests

- permission bypass attempts
- IDOR
- expired signed media link
- token reuse
- webhook forgery
- rate limiting
- malicious upload
- unauthorized call recording access

## Exit Gate

No critical or high security finding remains open.

---

# 36. Phase 28 — Performance and Scalability

## Objective

Ensure normal growth does not require redesign.

## Test

- concurrent inbound WhatsApp events
- search latency
- checkout latency
- order creation
- driver assignment race
- WebSocket connections
- analytics queries
- message queue backlog
- media processing

## Optimize

- indexes
- query plans
- caching
- pagination
- batch operations
- queue concurrency
- connection pools
- analytics pre-aggregation

## Target Principles

- normal dashboard API should feel immediate
- WhatsApp webhook should acknowledge quickly
- long AI/media processing must not block webhook thread
- search must remain usable as catalog grows
- financial operations prioritize correctness over speed

## Exit Gate

Load test reaches expected launch volume with acceptable error rate and no data corruption.

---

# 37. Phase 29 — Failure Recovery and Resilience

## Objective

Test what happens when dependencies fail.

## Simulate

```text
MySQL temporary outage
Redis outage
WhatsApp API failure
AI API timeout
AI invalid JSON
object storage failure
LiveKit failure
maps failure
worker crash
duplicate webhook
network interruption
```

## Required Behavior

- no duplicate order
- no duplicate driver assignment
- no duplicate refund
- no lost financial entry
- failed messages visible
- jobs retry safely
- support/operations informed where necessary

## Exit Gate

Provider failures degrade functionality rather than corrupting business state.

---

# 38. Phase 30 — Full End-to-End Regression Suite

## Objective

Test the complete Lion Delivery business, not individual modules.

## Scenario 1 — Standard Restaurant Order

```text
customer text
→ search
→ selection
→ cart
→ home address
→ confirm
→ merchant accept
→ driver accept
→ picked up
→ private chat
→ delivered
→ cash
→ review
```

## Scenario 2 — Grocery Image

```text
image
→ products extracted
→ supermarket comparison
→ selection
→ checkout
→ delivery
```

## Scenario 3 — Voice Order

```text
voice note
→ understood
→ clarification
→ results
→ order
```

## Scenario 4 — Merchant Rejects

```text
confirmed order
→ merchant rejects
→ alternative
→ customer accepts
→ second merchant
```

## Scenario 5 — Driver Rejects

```text
merchant accepted
→ driver A reject
→ driver B timeout
→ driver C accept
```

## Scenario 6 — Support

```text
order issue
→ AI recognizes support
→ human takeover
→ resolution
```

## Scenario 7 — Refund

```text
delivered
→ complaint
→ partial refund
→ ledger
→ merchant balance
```

## Scenario 8 — Private Call

```text
active delivery
→ driver call
→ private bridge
→ recording
→ call history
```

## Scenario 9 — Analytics

Verify same completed orders appear correctly in:

- orders
- merchant analytics
- driver analytics
- customer analytics
- finance
- dashboard AI

## Exit Gate

All critical E2E scenarios pass repeatedly in staging.

---

# 39. Phase 31 — Production Data and Launch Preparation

## Objective

Prepare real Lion Delivery operations.

## Tasks

- production merchant list
- merchant branches
- product/menu import
- categories
- pricing
- merchant availability
- drivers
- delivery zones
- admin users
- permissions
- finance settings
- communication settings
- WhatsApp production configuration
- LiveKit production configuration
- object storage
- backups
- monitoring
- alert recipients

## Data Validation

Validate:

- duplicate products
- missing prices
- invalid merchant hours
- invalid addresses
- unsupported zones
- missing driver WhatsApp numbers
- inactive merchants
- unavailable catalog items

## Exit Gate

Production configuration passes launch checklist without using demo data.

---

# 40. Phase 32 — User Acceptance Testing

## Participants

- owner/manager
- operations
- dispatcher
- support
- finance
- merchant representative
- driver representative

## UAT

Each role executes real business scenarios.

Capture:

```text
scenario
expected result
actual result
pass/fail
issue
severity
owner
resolution
```

## Exit Gate

All launch-blocking UAT issues resolved.

---

# 41. Phase 33 — Production Deployment

## Deployment

```text
database backup
      ↓
migration
      ↓
backend deploy
      ↓
worker deploy
      ↓
dashboard deploy
      ↓
health check
      ↓
WhatsApp verification
      ↓
LiveKit verification
      ↓
smoke order
      ↓
monitor
```

## Smoke Tests

- login
- product search
- WhatsApp inbound
- WhatsApp outbound
- create test order
- merchant action
- driver action
- dashboard real-time event
- delivery channel
- finance snapshot

## Exit Gate

Production smoke tests pass before customer traffic is enabled.

---

# 42. Phase 34 — Controlled Go-Live

## Recommended Rollout

Start with:

- limited merchants
- limited drivers
- limited geographic area
- operations team actively monitoring

Monitor:

- chat errors
- AI misunderstandings
- search failures
- merchant rejection
- driver assignment
- WhatsApp failures
- support escalation
- finance discrepancies

Expand only after stable operation.

---

# 43. Phase 35 — Post-Launch Stabilization

## Daily Review

During initial launch:

- failed jobs
- external API errors
- unresolved alerts
- abandoned conversations
- failed searches
- rejected orders
- delayed orders
- driver offer failures
- finance mismatches
- customer complaints

## Improvement

Update:

- product aliases
- AI examples
- search ranking
- support rules
- merchant data
- operational alerts

## Exit Gate

System reaches stable daily operation without manual emergency fixes.

---

# 44. Feature Priority Matrix

## Launch-Critical

```text
Authentication / RBAC
Merchants
Catalog
Customers
Addresses
WhatsApp
AI understanding
Search
Cart
Checkout
Orders
Merchant accept/reject
Drivers
Dispatch
Picked up / delivered
Private chat
Dashboard
Support
Basic finance
Basic analytics
Audit
Security
Backups
Monitoring
```

## High Priority After Core Stability

```text
LiveKit calling
Recording
Refunds
Settlements
Promotions
Advanced analytics
Management AI
Advanced reports
```

## Optimization / Growth

```text
loyalty
advanced personalization
advanced dispatch scoring
advanced product recommendations
additional payment methods
advanced marketing automation
```

---

# 45. Cross-Phase Testing Matrix

Every phase must preserve these areas:

| Area | Minimum Regression Check |
|---|---|
| Authentication | Login, refresh, logout |
| Permissions | Forbidden actions rejected |
| Database | Migrations apply cleanly |
| WhatsApp | Inbound/outbound basic message |
| Customers | Lookup by WhatsApp |
| Catalog | Product/price availability |
| Orders | Valid state transitions |
| Dispatch | Only one active assignment |
| Finance | Transaction remains balanced |
| Audit | Sensitive action logged |
| Dashboard | Build + core routes |
| Jobs | Failed jobs visible/retryable |

---

# 46. Data Migration Rules

Any schema change after initial deployment must use versioned migrations.

Never:

- edit production schema manually without migration
- drop financial data casually
- overwrite completed order snapshots
- rewrite historical audit records

Migration flow:

```text
create migration
→ test empty DB
→ test seeded DB
→ test copy of staging data
→ backup
→ apply staging
→ verify
→ production
```

---

# 47. API Completion Standard

An API is not complete until it has:

- route
- controller
- validation
- service
- repository/data access
- permission
- typed response
- documented errors
- tests
- audit behavior where required

---

# 48. Dashboard Screen Completion Standard

A dashboard screen is not complete until it has:

- loading state
- empty state
- error state
- permissions
- filters where needed
- pagination where needed
- form validation
- responsive layout
- successful API integration
- error feedback
- real-time update where required
- test coverage appropriate to risk

---

# 49. Integration Completion Standard

External integration is not complete until it handles:

```text
success
authentication failure
timeout
provider outage
rate limit
invalid response
duplicate event
retry
logging
manual recovery
```

---

# 50. Financial Completion Standard

Any financial workflow must satisfy:

- amount source documented
- transaction atomic
- immutable history
- authorization
- audit log
- duplicate prevention
- reconciliation path
- test for rollback

---

# 51. Security Completion Standard

No sensitive endpoint is complete without:

- authentication
- authorization
- input validation
- audit decision
- rate-limit decision
- sensitive data masking decision
- test for unauthorized access

---

# 52. Performance Targets to Define Before Launch

Exact numbers should be agreed from production infrastructure, but track at minimum:

```text
API p50 / p95 latency
search p95
checkout p95
webhook acknowledgement time
queue wait time
AI processing time
driver assignment time
dashboard real-time event latency
error rate
```

---

# 53. Monitoring Dashboard

Operational monitoring should include:

```text
API uptime
API errors
database health
Redis health
queue depth
failed jobs
WhatsApp inbound rate
WhatsApp failures
AI failures
LiveKit failures
orders created
orders stuck by status
merchant timeout count
driver timeout count
support backlog
```

---

# 54. Backup and Recovery Plan

Implement:

- automated MySQL backups
- encrypted backup storage
- object-storage retention
- restore procedure
- periodic restore test

Document:

```text
RPO
RTO
backup frequency
retention period
restore owner
```

---

# 55. Master Acceptance Checklist

The project cannot be declared complete until all relevant checks below pass.

## Platform

- [ ] React dashboard production build passes
- [ ] Node backend production build passes
- [ ] TypeScript passes
- [ ] lint passes
- [ ] migrations pass
- [ ] clean database install passes
- [ ] seed process passes
- [ ] Redis works
- [ ] workers run

## Security

- [ ] authentication tested
- [ ] RBAC tested
- [ ] audit tested
- [ ] rate limiting tested
- [ ] secrets reviewed
- [ ] media authorization tested
- [ ] webhook signatures tested
- [ ] high/critical security findings resolved

## Customers

- [ ] WhatsApp customer created automatically
- [ ] profile works
- [ ] saved addresses work
- [ ] map location works
- [ ] entrance photo works
- [ ] voice directions work
- [ ] favorites work

## WhatsApp

- [ ] text works
- [ ] Arabic works
- [ ] Arabizi works
- [ ] English works
- [ ] mixed language works
- [ ] image works
- [ ] audio works
- [ ] video works
- [ ] location works
- [ ] outbound messages work
- [ ] retries work
- [ ] duplicates do not duplicate business action

## AI

- [ ] intent extraction works
- [ ] structured output validated
- [ ] ambiguity causes clarification
- [ ] AI cannot invent prices
- [ ] AI cannot directly write database
- [ ] invalid AI output handled safely
- [ ] cost tracking works

## Search

- [ ] exact search
- [ ] aliases
- [ ] Arabic
- [ ] Arabizi
- [ ] semantic match
- [ ] availability
- [ ] merchant open
- [ ] delivery zone
- [ ] basket comparison
- [ ] no-result analytics

## Cart

- [ ] add
- [ ] remove
- [ ] quantity
- [ ] variant
- [ ] add-on
- [ ] notes
- [ ] price recalculation
- [ ] expiry/stale handling

## Orders

- [ ] confirmation
- [ ] merchant workflow
- [ ] rejection
- [ ] alternatives
- [ ] cancellation
- [ ] substitutions
- [ ] status history
- [ ] repeat order

## Drivers

- [ ] availability
- [ ] offer
- [ ] accept
- [ ] reject
- [ ] timeout
- [ ] assignment
- [ ] duplicate acceptance prevented
- [ ] picked up
- [ ] delivered
- [ ] reassignment

## Communication

- [ ] private chat
- [ ] phone numbers hidden
- [ ] voice relay
- [ ] image relay
- [ ] channel expiry
- [ ] dashboard conversation history

## Calling

- [ ] customer → driver
- [ ] driver → customer
- [ ] identity protected
- [ ] consent
- [ ] recording
- [ ] transcript
- [ ] permission-controlled playback
- [ ] provider failure fallback

## Support

- [ ] case creation
- [ ] AI handoff
- [ ] human takeover
- [ ] notes
- [ ] complaint
- [ ] escalation
- [ ] resolution
- [ ] return to automated mode

## Finance

- [ ] order snapshot
- [ ] ledger
- [ ] cash collection
- [ ] driver balance
- [ ] merchant balance
- [ ] refund
- [ ] partial refund
- [ ] merchant settlement
- [ ] driver settlement
- [ ] reconciliation

## Promotions

- [ ] promotion eligibility
- [ ] voucher
- [ ] first order
- [ ] free delivery
- [ ] maximum usage
- [ ] redemption history

## Analytics

- [ ] orders
- [ ] customers
- [ ] merchants
- [ ] drivers
- [ ] products
- [ ] AI
- [ ] WhatsApp
- [ ] finance
- [ ] date filters
- [ ] report export
- [ ] totals reconcile

## Management AI

- [ ] read-only tools
- [ ] correct permissions
- [ ] order questions
- [ ] merchant questions
- [ ] driver questions
- [ ] product-demand questions
- [ ] finance questions
- [ ] comparisons
- [ ] no arbitrary SQL access

## Production

- [ ] monitoring active
- [ ] backups active
- [ ] restore tested
- [ ] staging accepted
- [ ] production smoke tests pass
- [ ] no launch-blocking defect
- [ ] operations team trained
- [ ] support team trained
- [ ] finance team trained

---

# 56. Final Definition of Done

Lion Delivery is considered complete only when the following complete journey works in production:

```text
CUSTOMER SENDS NATURAL WHATSAPP REQUEST
        ↓
AI UNDERSTANDS
        ↓
SYSTEM SEARCHES REAL MERCHANT DATA
        ↓
CUSTOMER SELECTS
        ↓
CART IS BUILT
        ↓
ADDRESS IS SELECTED
        ↓
FINAL PRICE IS VERIFIED
        ↓
CUSTOMER CONFIRMS
        ↓
ORDER IS CREATED ONCE
        ↓
MERCHANT ACCEPTS
        ↓
DRIVER IS ASSIGNED ONCE
        ↓
DRIVER ACCEPTS
        ↓
ORDER IS PICKED UP
        ↓
CUSTOMER AND DRIVER COMMUNICATE PRIVATELY
        ↓
OPTIONAL PRIVATE CALL WORKS
        ↓
ORDER IS DELIVERED
        ↓
CASH / FINANCE IS RECORDED
        ↓
CUSTOMER FEEDBACK IS STORED
        ↓
MERCHANT / DRIVER BALANCES UPDATE
        ↓
ANALYTICS UPDATE
        ↓
MANAGEMENT CAN QUERY THE BUSINESS
```

At the same time:

- duplicate webhooks do not create duplicate orders
- duplicate driver actions do not create duplicate assignments
- AI failures do not corrupt business state
- WhatsApp failure does not corrupt orders
- LiveKit failure does not block delivery
- financial transactions remain balanced
- customer and driver privacy remains enforced
- permissions cannot be bypassed
- sensitive media remains private
- all critical business actions remain auditable

Only then should the project be marked:

```text
READY FOR PRODUCTION
```

---

# 57. Recommended Build Order Summary

```text
PHASE 0   Audit / Baseline
PHASE 1   Backend Foundation
PHASE 2   Dashboard Foundation
PHASE 3   Auth / RBAC / Audit
PHASE 4   Delivery Zones / Merchants
PHASE 5   Catalog / Pricing / Availability
PHASE 6   Customers / Addresses
PHASE 7   Media Storage
PHASE 8   WhatsApp Integration
PHASE 9   Customer AI Engine
PHASE 10  Search / Recommendations
PHASE 11  Cart / Checkout
PHASE 12  Orders
PHASE 13  Merchant Workflow
PHASE 14  Drivers / Dispatch
PHASE 15  Private Messaging
PHASE 16  LiveKit Calling
PHASE 17  Support
PHASE 18  Finance / Cash
PHASE 19  Refunds / Settlements
PHASE 20  Promotions / Loyalty
PHASE 21  Live Operations
PHASE 22  Notifications / Automation
PHASE 23  Analytics Pipeline
PHASE 24  Analytics / Reports
PHASE 25  Management AI
PHASE 26  Cost Tracking
PHASE 27  Security / Privacy
PHASE 28  Performance / Scalability
PHASE 29  Failure Recovery
PHASE 30  Full Regression
PHASE 31  Production Data
PHASE 32  UAT
PHASE 33  Production Deployment
PHASE 34  Controlled Go-Live
PHASE 35  Stabilization
```

---

# 58. Final Implementation Principle

The project should be implemented phase by phase until every phase is complete.

Do not mark a phase complete based on partial UI, placeholder logic, mocked business behavior, or happy-path-only testing.

For every phase:

```text
BUILD
  ↓
VERIFY
  ↓
TEST
  ↓
AUDIT
  ↓
FIX
  ↓
REGRESSION TEST
  ↓
ACCEPT
  ↓
CONTINUE
```

The final goal is not merely to have all screens and endpoints present.

The final goal is a production-ready Lion Delivery operating platform in which every documented business workflow is implemented, connected, secured, tested, observable, and ready for real customer orders.
