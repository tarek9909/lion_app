# Lion Delivery
## Full Technical Documentation
### WhatsApp-First AI-Assisted Delivery Operations Platform

---

# 1. Document Purpose

This document defines the technical architecture and implementation blueprint for the Lion Delivery platform.

The platform is designed as a WhatsApp-first delivery operating system with:

- Customer ordering through WhatsApp
- AI-assisted understanding of text, Arabic, Lebanese Arabizi, English, images, voice notes, and video
- Merchant and product discovery
- Cart and checkout
- Saved customer addresses
- Merchant order handling
- Driver dispatch
- Private customer-driver communication
- Private calling and call recording
- Internal operations dashboard
- Customer support
- Finance and settlements
- Analytics and reporting
- Management AI assistant

This document focuses on system design, backend architecture, frontend architecture, data design, API design, workflows, integrations, security, observability, testing, and deployment.

---

# 2. Primary Technology Stack

## Frontend

- React
- Vite
- TypeScript
- React Router
- React Query / TanStack Query
- Zustand or Redux Toolkit for local/global UI state
- Tailwind CSS or equivalent component styling system
- Charting library for analytics
- WebSocket / Socket.IO client for live operations

## Backend

- Node.js
- TypeScript
- Express.js or Fastify
- REST API
- WebSocket / Socket.IO for live updates
- MySQL
- Redis recommended for:
  - conversation state
  - queues
  - rate limiting
  - distributed locks
  - caching
  - real-time presence
- BullMQ or equivalent for background jobs

## Core External Integrations

- Official Meta WhatsApp Business Platform / Cloud API
- AI provider abstraction
  - Customer AI model
  - Dashboard analytics AI model
- LiveKit
  - private customer-driver calling
  - call bridging
  - recording
- Object storage
  - customer images
  - voice notes
  - videos
  - address photos
  - call recordings
  - proof-of-delivery files
- Maps provider
  - geocoding
  - reverse geocoding
  - map previews
  - driver/customer/merchant coordinates

## Recommended Infrastructure

- Linux server
- Nginx
- PM2 or Docker
- MySQL
- Redis
- Object storage
- HTTPS
- Domain / subdomains

Example:

```text
dashboard.liondelivery.com
api.liondelivery.com
media.liondelivery.com
```

---

# 3. System Architecture

```text
                    CUSTOMER WHATSAPP
                           |
                           v
                META WHATSAPP CLOUD API
                           |
                           v
                  WEBHOOK GATEWAY
                           |
                           v
                CONVERSATION SERVICE
                           |
          +----------------+----------------+
          |                                 |
          v                                 v
      AI SERVICE                       MEDIA SERVICE
          |                                 |
          v                                 v
  INTENT / ENTITY PARSING             IMAGE / AUDIO /
          |                            VIDEO HANDLING
          v
     ORDER ORCHESTRATOR
          |
          +--------------+------------------+
          |              |                  |
          v              v                  v
   PRODUCT SEARCH     CART SERVICE      CUSTOMER SERVICE
          |              |                  |
          v              v                  v
    MERCHANT DATA     ORDER SERVICE     ADDRESS SERVICE
          |
          v
     DISPATCH SERVICE
          |
     +----+-----+
     |          |
     v          v
 MERCHANT     DRIVER
     |          |
     +----+-----+
          |
          v
 COMMUNICATION RELAY
          |
          v
        LIVEKIT
          |
          v
 CALLING / RECORDING
```

Internal management:

```text
REACT DASHBOARD
      |
      v
 REST + WEBSOCKET API
      |
      v
 BACKEND SERVICES
      |
      +-------------------------------+
      | Orders                        |
      | Customers                     |
      | Merchants                     |
      | Drivers                       |
      | Dispatch                      |
      | Conversations                 |
      | Support                       |
      | Finance                       |
      | Analytics                     |
      | Reports                       |
      | Management AI                 |
      +-------------------------------+
      |
      v
 MYSQL + REDIS + OBJECT STORAGE
```

---

# 4. Architectural Principles

## 4.1 AI Does Not Own Business Truth

AI may:

- understand user intent
- interpret language
- extract products
- extract quantities
- interpret images
- interpret voice
- interpret video
- suggest queries
- summarize results
- explain analytics

AI must not independently decide:

- product price
- availability
- merchant operating status
- delivery fee
- final total
- merchant settlement
- driver settlement
- refund amount
- order ownership

These values must come from controlled backend services.

## 4.2 Business State Is Stored Explicitly

Conversation history alone must not be treated as the system state.

Important state must be stored explicitly:

- current cart
- selected merchant
- selected address
- selected product
- active order
- current conversation stage
- pending clarification
- current driver
- merchant order status

## 4.3 Idempotency

All important operations must be safe against duplicate events.

Examples:

- WhatsApp webhook delivered twice
- driver accepts twice
- customer confirms twice
- merchant accepts twice
- payment callback arrives twice

Use:

- unique event identifiers
- idempotency keys
- database constraints
- transactional checks

## 4.4 Event-Driven Internal Design

Important business actions should produce internal events.

Examples:

```text
order.created
merchant.accepted
merchant.rejected
driver.assigned
driver.accepted
order.picked_up
order.delivered
support.case_created
refund.approved
settlement.completed
```

These events can power:

- notifications
- analytics
- audit logs
- automation
- dashboard updates

---

# 5. Main Backend Modules

```text
Auth
Users
Roles
Permissions

Customers
Customer Addresses
Customer Preferences

Merchants
Merchant Branches
Merchant Hours
Merchant Delivery Zones

Catalog
Categories
Products
Product Variants
Product Add-ons
Product Aliases
Availability
Pricing
Promotions

Search
Recommendation
Basket Comparison

Conversations
Messages
Media
AI Orchestration

Carts
Cart Items

Orders
Order Items
Order Timeline

Merchant Order Workflow

Drivers
Driver Availability
Driver Assignment
Dispatch

Private Communication Relay
Calls
Call Recordings

Support
Complaints
Cases

Payments
Cash Collection
Refunds
Finance Ledger

Merchant Settlements
Driver Settlements

Analytics
Reports
Management AI

Notifications
Automations
Audit Logs
System Settings
```

---

# 6. Frontend Modules

The React/Vite dashboard should include:

```text
/dashboard
/orders
/live-operations
/conversations
/customers
/customer-addresses
/merchants
/branches
/catalog
/products
/drivers
/dispatch
/support
/complaints
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

---

# 7. Suggested Frontend Structure

```text
src/
  app/
    router/
    providers/
    query/
    auth/

  features/
    dashboard/
    orders/
    live-operations/
    conversations/
    customers/
    merchants/
    catalog/
    drivers/
    dispatch/
    support/
    promotions/
    finance/
    settlements/
    analytics/
    reports/
    management-ai/
    users/
    roles/
    settings/
    audit/

  components/
    ui/
    tables/
    charts/
    forms/
    dialogs/
    maps/
    media/
    timeline/

  services/
    api/
    websocket/

  hooks/

  lib/

  types/

  utils/
```

Each feature should contain only the files it needs.

Example:

```text
features/orders/
  pages/
  components/
  hooks/
  services/
  types/
```

---

# 8. Suggested Backend Structure

```text
src/
  app.ts
  server.ts

  config/

  modules/
    auth/
    users/
    roles/
    customers/
    addresses/
    merchants/
    catalog/
    search/
    conversations/
    ai/
    carts/
    orders/
    drivers/
    dispatch/
    communications/
    calls/
    support/
    finance/
    settlements/
    analytics/
    reports/
    notifications/
    audit/

  middleware/

  jobs/

  events/

  integrations/
    whatsapp/
    ai/
    livekit/
    maps/
    storage/

  database/
    migrations/
    seeders/
    repositories/

  shared/
    errors/
    logger/
    validation/
    security/
    types/
    utils/
```

Each module should normally contain:

```text
controller
service
repository
routes
validation
types
events
```

---

# 9. Core Database Domains

The main database should be relational and normalized around the following domains.

## 9.1 Identity and Access

Tables:

```text
users
roles
permissions
user_roles
role_permissions
sessions
audit_logs
```

## 9.2 Customers

```text
customers
customer_addresses
customer_preferences
customer_favorites
customer_tags
```

## 9.3 Merchants

```text
merchants
merchant_branches
merchant_operating_hours
merchant_delivery_zones
merchant_contacts
merchant_status_history
```

## 9.4 Catalog

```text
categories
products
product_variants
product_addons
product_aliases
merchant_products
merchant_product_prices
merchant_product_availability
product_images
```

## 9.5 Conversations

```text
conversations
conversation_participants
messages
message_media
conversation_state
ai_interactions
```

## 9.6 Carts

```text
carts
cart_items
cart_item_addons
```

## 9.7 Orders

```text
orders
order_items
order_item_addons
order_status_history
order_notes
order_events
```

## 9.8 Drivers

```text
drivers
driver_availability
driver_assignments
driver_status_history
driver_performance_daily
```

## 9.9 Communication Relay

```text
delivery_channels
delivery_messages
delivery_calls
call_recordings
call_transcripts
```

## 9.10 Support

```text
support_cases
support_messages
support_notes
support_actions
complaints
```

## 9.11 Finance

```text
financial_transactions
order_financials
merchant_balances
driver_balances
refunds
merchant_settlements
merchant_settlement_items
driver_settlements
driver_settlement_items
cash_reconciliations
```

## 9.12 Promotions

```text
promotions
promotion_rules
promotion_merchants
promotion_products
promotion_customers
promotion_redemptions
```

## 9.13 Analytics

Prefer analytics tables / materialized aggregates for heavy dashboards:

```text
analytics_daily_orders
analytics_daily_merchants
analytics_daily_drivers
analytics_daily_customers
analytics_daily_ai
analytics_daily_whatsapp
```

---

# 10. Important Data Model Details

## 10.1 Customers

Important fields:

```text
id
whatsapp_number
display_name
status
default_address_id
preferred_language
created_at
updated_at
```

Do not expose internal numeric IDs in the UI.

## 10.2 Customer Addresses

```text
id
customer_id
label
formatted_address
latitude
longitude
landmark
building
floor
apartment
delivery_notes
entrance_photo_url
voice_note_url
voice_transcript
contact_name
contact_phone
is_default
status
created_at
updated_at
```

## 10.3 Merchants

```text
id
name
type
status
default_preparation_minutes
rating
commission_type
commission_value
created_at
updated_at
```

## 10.4 Merchant Branches

```text
id
merchant_id
name
address
latitude
longitude
phone
status
```

## 10.5 Products

```text
id
category_id
canonical_name
name_ar
name_en
description
brand
status
```

Merchant-specific product:

```text
merchant_product_id
merchant_branch_id
product_id
merchant_product_name
price
discount_price
is_available
preparation_minutes
```

## 10.6 Product Aliases

Examples:

```text
product_id
alias
language
source
weight
```

Aliases may contain:

- Arabic
- English
- Arabizi
- spelling variants
- brand abbreviations

## 10.7 Orders

```text
id
order_number
customer_id
merchant_branch_id
address_id
driver_id
status
payment_method
subtotal
delivery_fee
service_fee
discount_total
grand_total
merchant_total
company_commission
driver_amount
currency
confirmed_at
accepted_at
picked_up_at
delivered_at
created_at
updated_at
```

## 10.8 Order Statuses

Recommended values:

```text
DRAFT
PENDING_CUSTOMER_CONFIRMATION
CONFIRMED
WAITING_FOR_MERCHANT
MERCHANT_ACCEPTED
MERCHANT_REJECTED
PREPARING
READY
WAITING_FOR_DRIVER
DRIVER_ASSIGNED
PICKED_UP
ON_THE_WAY
DELIVERED
CANCELLED
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

---

# 11. Customer Conversation State Machine

Recommended states:

```text
IDLE
UNDERSTANDING_REQUEST
WAITING_FOR_CLARIFICATION
SEARCHING
SHOWING_RESULTS
WAITING_FOR_SELECTION
CONFIGURING_PRODUCT
CART_REVIEW
WAITING_FOR_ADDRESS
WAITING_FOR_CONFIRMATION
ORDER_CREATED
ORDER_ACTIVE
SUPPORT_HANDOFF
CLOSED
```

Conversation state example:

```json
{
  "currentState": "WAITING_FOR_SELECTION",
  "activeCartId": "...",
  "activeSearchId": "...",
  "lastPresentedOptions": ["...", "...", "..."],
  "pendingQuestion": "SELECT_PRODUCT"
}
```

---

# 12. WhatsApp Webhook Flow

```text
META
  ↓
POST /webhooks/whatsapp
  ↓
VERIFY SIGNATURE
  ↓
CHECK EVENT ID
  ↓
IGNORE DUPLICATE
  ↓
STORE RAW EVENT
  ↓
NORMALIZE MESSAGE
  ↓
IDENTIFY CUSTOMER / DRIVER / MERCHANT
  ↓
ROUTE MESSAGE
  ↓
PROCESS
  ↓
SEND RESPONSE
  ↓
STORE OUTBOUND MESSAGE
```

Webhook processing should be fast.

Long-running AI/media processing should be placed in a background queue.

---

# 13. Message Types

The message layer should support:

```text
TEXT
IMAGE
AUDIO
VIDEO
DOCUMENT
LOCATION
INTERACTIVE_REPLY
BUTTON_REPLY
SYSTEM
```

Each message should store:

```text
provider_message_id
conversation_id
sender_type
sender_reference
message_type
text
media_url
reply_to_message_id
received_at
processed_at
status
```

---

# 14. AI Orchestration

AI should return structured outputs.

Example:

```json
{
  "intent": "SEARCH_PRODUCTS",
  "language": "arabizi",
  "items": [
    {
      "query": "crispy chicken sandwich",
      "quantity": 2,
      "max_price": null,
      "brand": null,
      "size": null
    }
  ],
  "preferences": {
    "ranking": "best_value",
    "max_budget": 15
  },
  "needsClarification": false
}
```

Supported intents may include:

```text
SEARCH_PRODUCTS
SEARCH_MERCHANT
ADD_TO_CART
REMOVE_FROM_CART
UPDATE_QUANTITY
SELECT_RESULT
CHECKOUT
SAVE_ADDRESS
SELECT_ADDRESS
ORDER_STATUS
CANCEL_ORDER
REPEAT_ORDER
CONTACT_SUPPORT
DRIVER_CHAT
UNKNOWN
```

---

# 15. AI Tool Interface

AI should only interact with the platform through controlled backend tools.

Recommended tools:

```text
searchProducts
searchMerchants
getProductDetails
getProductVariants
getBasketComparison
getDeliveryQuote
getCustomerAddresses
getCustomerPreviousOrders
getCart
addCartItem
updateCartItem
removeCartItem
selectAddress
createOrderPreview
confirmOrder
getOrderStatus
requestHumanSupport
```

AI does not access the database directly.

---

# 16. Media Processing

## Images

Use cases:

- product image
- shopping list
- screenshot
- building entrance
- proof of delivery

Processing:

```text
RECEIVE IMAGE
   ↓
DOWNLOAD
   ↓
STORE
   ↓
SEND RELEVANT IMAGE TO AI
   ↓
EXTRACT STRUCTURED INFORMATION
```

## Audio

Use cases:

- shopping request
- address instructions
- customer-driver voice messages

Processing:

```text
RECEIVE AUDIO
   ↓
STORE ORIGINAL
   ↓
AI AUDIO UNDERSTANDING / TRANSCRIPTION
   ↓
STORE TRANSCRIPT
   ↓
PROCESS INTENT
```

## Video

Use cases:

- showing requested products
- showing delivery entrance
- visual customer request

Processing:

```text
RECEIVE VIDEO
   ↓
STORE
   ↓
SEND TO AI MEDIA PROCESSOR
   ↓
EXTRACT REQUEST / PRODUCTS / CONTEXT
```

---

# 17. Product Search Architecture

Do not rely on simple SQL LIKE only.

Recommended layered search:

```text
1. exact match
2. normalized text match
3. alias match
4. language-normalized match
5. semantic similarity
6. merchant availability filter
7. delivery-zone filter
8. ranking
```

Search result ranking may consider:

```text
text relevance
semantic relevance
availability
merchant status
price
delivery fee
ETA
rating
promotion
distance
```

---

# 18. Basket Comparison

For multiple requested items:

```text
REQUESTED ITEMS
      ↓
MATCH PRODUCTS
      ↓
GROUP BY MERCHANT
      ↓
CHECK WHICH MERCHANTS CAN FULFILL MOST / ALL ITEMS
      ↓
CALCULATE:
  item total
  delivery fee
  discount
  final total
      ↓
RANK COMPLETE BASKETS
```

The backend performs all calculations.

AI only explains the result.

---

# 19. Cart Architecture

A cart must store:

```text
customer
merchant
items
quantities
variants
addons
notes
subtotal
discounts
estimated delivery fee
estimated total
expiration
```

Important rules:

- one active cart per merchant
- never trust stale prices
- recalculate before confirmation
- validate availability before confirmation

---

# 20. Checkout Workflow

```text
CUSTOMER CONFIRMS CART
      ↓
VALIDATE PRODUCTS
      ↓
VALIDATE PRICES
      ↓
VALIDATE MERCHANT OPEN
      ↓
VALIDATE DELIVERY AREA
      ↓
CALCULATE DELIVERY FEE
      ↓
APPLY PROMOTIONS
      ↓
LOCK ORDER PREVIEW
      ↓
SHOW FINAL TOTAL
      ↓
CUSTOMER CONFIRMS
      ↓
CREATE ORDER
```

---

# 21. Merchant Workflow

Merchant state:

```text
WAITING
ACCEPTED
REJECTED
PREPARING
READY
HANDED_TO_DRIVER
```

Merchant actions:

```text
accept
reject
set preparation time
mark preparing
mark ready
report unavailable product
report issue
```

If rejected:

```text
merchant rejection
      ↓
store reason
      ↓
search alternatives
      ↓
send options to customer
```

---

# 22. Dispatch Architecture

Dispatch should support automated and manual assignment.

Eligibility checks:

```text
driver active
driver available
driver in supported area
driver not overloaded
driver not blocked
driver distance acceptable
```

Assignment flow:

```text
ORDER READY FOR ASSIGNMENT
      ↓
SELECT DRIVER
      ↓
CREATE OFFER
      ↓
WAIT FOR RESPONSE
      ↓
ACCEPT?
   YES → LOCK ASSIGNMENT
   NO  → NEXT DRIVER
TIMEOUT → NEXT DRIVER
```

Use a distributed lock / database transaction to ensure only one driver can own the order.

---

# 23. Driver Workflow

Driver receives:

```text
order reference
merchant
pickup location
delivery location
delivery instructions
entrance image
voice directions
cash amount
```

Driver actions:

```text
ACCEPT
REJECT
PICKED_UP
DELIVERED
CHAT_CUSTOMER
CALL_CUSTOMER
REPORT_ISSUE
```

---

# 24. Private Customer-Driver Messaging

Neither side should receive the other side's personal number.

Architecture:

```text
DRIVER WHATSAPP
      ↓
LION RELAY
      ↓
CUSTOMER WHATSAPP
```

and reverse.

Every relayed message should store:

```text
order_id
sender_role
source_message_id
target_message_id
type
content
media
sent_at
delivery_status
```

Relay channel opens when required and closes after delivery.

---

# 25. LiveKit Calling

Purpose:

- customer calls driver
- driver calls customer
- identity remains hidden
- call may be recorded according to policy

Workflow:

```text
CALL REQUEST
      ↓
VERIFY ACTIVE ORDER
      ↓
VERIFY CALL PERMISSION
      ↓
CREATE LIVEKIT SESSION
      ↓
CONNECT DRIVER LEG
      ↓
CONNECT CUSTOMER LEG
      ↓
BRIDGE CALL
      ↓
OPTIONALLY RECORD
      ↓
STORE CALL METADATA
      ↓
CLOSE SESSION
```

Store:

```text
order_id
room_name
caller_role
started_at
connected_at
ended_at
duration
recording_status
recording_url
transcript_url
```

---

# 26. Call Recording

Recording workflow:

```text
CALL CONNECTED
      ↓
START RECORDING
      ↓
CALL ENDS
      ↓
FINALIZE RECORDING
      ↓
UPLOAD / STORE FILE
      ↓
SAVE RECORDING METADATA
      ↓
OPTIONAL TRANSCRIPTION
```

Access to recordings must be permission-controlled.

Retention should be configurable.

---

# 27. Support Architecture

Support cases should link:

```text
customer
order
merchant
driver
conversation
issue type
priority
status
assigned agent
resolution
```

Statuses:

```text
OPEN
IN_PROGRESS
WAITING_CUSTOMER
WAITING_MERCHANT
WAITING_DRIVER
ESCALATED
RESOLVED
CLOSED
```

---

# 28. Finance Architecture

Finance should use a ledger-style design.

Never derive historical balances only from current order values.

Financial transaction types may include:

```text
ORDER_CHARGE
DELIVERY_FEE
SERVICE_FEE
MERCHANT_COMMISSION
DRIVER_EARNING
CASH_COLLECTION
REFUND
PARTIAL_REFUND
PROMOTION_DISCOUNT
ADJUSTMENT
MERCHANT_SETTLEMENT
DRIVER_SETTLEMENT
```

Every financial movement should create a transaction record.

---

# 29. Order Financial Breakdown

Store a financial snapshot when the order is completed.

Example:

```text
subtotal
discount
delivery_fee
service_fee
grand_total
merchant_gross
company_commission
driver_earning
company_net_before_costs
```

Do not recalculate historical completed orders from current product prices.

---

# 30. Cash Reconciliation

```text
DRIVER DELIVERS
      ↓
CASH COLLECTED
      ↓
DRIVER CASH LIABILITY UPDATED
      ↓
RECONCILIATION SESSION
      ↓
DRIVER HANDS CASH / OFFSET APPLIED
      ↓
BALANCE CLEARED
```

---

# 31. Merchant Settlement

```text
COMPLETED ORDERS
      ↓
CALCULATE MERCHANT PAYABLES
      ↓
APPLY:
  commissions
  refunds
  adjustments
      ↓
CREATE SETTLEMENT
      ↓
APPROVE
      ↓
MARK PAID
```

---

# 32. Driver Settlement

```text
COMPLETED DELIVERIES
      ↓
CALCULATE DRIVER EARNINGS
      ↓
COMPARE CASH HELD
      ↓
APPLY ADJUSTMENTS
      ↓
CREATE SETTLEMENT
      ↓
SETTLE
```

---

# 33. Promotion Engine

Promotion rules can target:

```text
all customers
new customers
specific customer
merchant
branch
category
product
delivery area
minimum basket
date range
order count
```

Promotion types:

```text
percentage
fixed amount
free delivery
service fee waiver
voucher
loyalty reward
```

---

# 34. Analytics Architecture

Do not run every dashboard chart directly against large operational tables.

Recommended approach:

```text
Operational MySQL
      ↓
Scheduled aggregation jobs
      ↓
Analytics summary tables
      ↓
Dashboard
```

Near-real-time counters may use:

- Redis
- incremental SQL aggregates
- event processing

---

# 35. Dashboard Analytics

## Orders

```text
orders today
completed
cancelled
failed
active
average order value
average items
average preparation time
average delivery time
```

## Customers

```text
new customers
returning customers
repeat rate
lifetime value
average spend
top areas
```

## Merchants

```text
sales
orders
acceptance
rejection
preparation time
ratings
complaints
unavailable products
```

## Drivers

```text
accepted
rejected
completed
delivery time
cash collected
earnings
ratings
```

## AI

```text
AI interactions
successful understanding
clarifications
failed searches
human handoffs
AI cost
AI cost per order
```

## WhatsApp

```text
conversations
messages
media types
average messages per chat
conversion rate
communication cost
```

## Finance

```text
GMV
company revenue
delivery revenue
commissions
refunds
discounts
merchant payable
driver payable
gross profit
```

---

# 36. Management AI Assistant

The dashboard AI assistant should be read-only by default.

Supported examples:

```text
How many orders today?
Which merchant rejected the most orders?
Compare this week to last week.
Why did cancellations increase?
Which products are searched but unavailable?
Which drivers have the best delivery time?
What is today's revenue?
```

Architecture:

```text
USER QUESTION
      ↓
AI INTENT
      ↓
AUTHORIZED ANALYTICS TOOL
      ↓
QUERY ANALYTICS DATA
      ↓
STRUCTURED RESULT
      ↓
AI SUMMARY
```

Do not allow the AI to write arbitrary SQL directly against production.

Expose controlled analytics functions.

---

# 37. API Design

Base path:

```text
/api/v1
```

Recommended top-level routes:

```text
/auth
/users
/roles
/customers
/addresses
/merchants
/branches
/categories
/products
/catalog
/search
/carts
/orders
/drivers
/dispatch
/conversations
/support
/promotions
/finance
/settlements
/analytics
/reports
/management-ai
/settings
/audit
```

Webhook routes:

```text
/webhooks/whatsapp
/webhooks/livekit
/webhooks/storage
```

---

# 38. Example API Endpoints

## Customer

```text
GET    /api/v1/customers
GET    /api/v1/customers/:id
POST   /api/v1/customers
PATCH  /api/v1/customers/:id
```

## Addresses

```text
GET    /api/v1/customers/:customerId/addresses
POST   /api/v1/customers/:customerId/addresses
PATCH  /api/v1/addresses/:id
DELETE /api/v1/addresses/:id
```

## Merchants

```text
GET    /api/v1/merchants
POST   /api/v1/merchants
GET    /api/v1/merchants/:id
PATCH  /api/v1/merchants/:id
```

## Products

```text
GET    /api/v1/products
POST   /api/v1/products
PATCH  /api/v1/products/:id
GET    /api/v1/search/products
```

## Orders

```text
GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders/:id/confirm
POST   /api/v1/orders/:id/cancel
POST   /api/v1/orders/:id/merchant-accept
POST   /api/v1/orders/:id/merchant-reject
POST   /api/v1/orders/:id/picked-up
POST   /api/v1/orders/:id/delivered
```

## Dispatch

```text
POST /api/v1/orders/:id/dispatch
POST /api/v1/driver-offers/:id/accept
POST /api/v1/driver-offers/:id/reject
POST /api/v1/orders/:id/reassign-driver
```

## Support

```text
GET  /api/v1/support/cases
POST /api/v1/support/cases
POST /api/v1/support/cases/:id/assign
POST /api/v1/support/cases/:id/resolve
```

---

# 39. API Response Standard

Recommended successful response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_ALREADY_ASSIGNED",
    "message": "This order already has an assigned driver."
  }
}
```

---

# 40. Validation

All request inputs must be validated.

Recommended validation categories:

```text
required fields
types
formats
enum values
numeric ranges
string length
phone format
coordinates
date ranges
business rules
```

Do not rely only on frontend validation.

---

# 41. Authentication

Dashboard authentication:

```text
email / username
password
optional MFA
access token
refresh token
```

Recommended:

- short-lived access token
- secure refresh token
- httpOnly secure cookie for refresh
- revoke on logout
- device/session tracking

---

# 42. Authorization

Use RBAC.

Example permissions:

```text
orders.view
orders.manage
orders.cancel
drivers.view
drivers.assign
merchants.manage
customers.view
support.manage
finance.view
finance.refund
settlements.manage
analytics.view
calls.listen
audit.view
settings.manage
```

Frontend hides unauthorized actions.

Backend must enforce every permission independently.

---

# 43. Security

Required controls:

- HTTPS only
- secure password hashing
- request validation
- rate limiting
- webhook signature verification
- RBAC
- audit logs
- encryption for sensitive data
- secrets outside source code
- least-privilege database user
- object-storage access control
- expiring signed media URLs
- CSRF protection where applicable
- secure CORS
- SQL injection prevention
- XSS prevention
- content security policy
- dependency scanning
- login throttling

---

# 44. Privacy

Sensitive information includes:

- phone numbers
- customer locations
- address photos
- voice notes
- call recordings
- conversation history

Access should be role-based.

The dashboard should mask data where full visibility is unnecessary.

Examples:

```text
03 *** ***
Customer #1234
Driver #42
```

---

# 45. Media Security

Media storage rules:

- never expose raw internal storage credentials
- store media with random object names
- use signed temporary URLs
- separate private and public buckets
- scan uploads where appropriate
- enforce size limits
- enforce MIME type validation
- retention rules

---

# 46. Audit Logging

Audit every sensitive admin action.

Audit log fields:

```text
actor_user_id
action
entity_type
entity_id
before_json
after_json
ip_address
user_agent
created_at
```

Examples:

```text
refund approved
driver reassigned
merchant commission changed
product price changed
settlement marked paid
recording accessed
role changed
```

---

# 47. Background Jobs

Recommended queue jobs:

```text
process_whatsapp_message
process_image
process_audio
process_video
send_whatsapp_message
send_order_notification
dispatch_driver
driver_offer_timeout
merchant_timeout
generate_transcript
generate_daily_analytics
generate_report
close_delivery_channel
settlement_calculation
media_cleanup
```

---

# 48. Redis Usage

Recommended uses:

```text
conversation state cache
job queues
distributed locks
rate limits
websocket presence
short-lived search results
driver offer timeout
idempotency
```

MySQL remains the source of truth.

---

# 49. Real-Time Dashboard

Use WebSocket events for:

```text
order.created
order.updated
merchant.accepted
merchant.rejected
driver.offer_created
driver.assigned
order.picked_up
order.delivered
conversation.message
support.case_updated
```

Dashboard should update without page refresh.

---

# 50. Error Handling

Backend should use centralized typed errors.

Examples:

```text
VALIDATION_ERROR
AUTHENTICATION_REQUIRED
FORBIDDEN
CUSTOMER_NOT_FOUND
MERCHANT_CLOSED
PRODUCT_UNAVAILABLE
PRICE_CHANGED
ADDRESS_OUTSIDE_ZONE
ORDER_ALREADY_CONFIRMED
ORDER_ALREADY_ASSIGNED
DRIVER_UNAVAILABLE
SUPPORT_REQUIRED
EXTERNAL_PROVIDER_ERROR
```

---

# 51. External Integration Resilience

All external integrations should have:

- timeout
- retry policy
- exponential backoff
- circuit breaker where useful
- logging
- dead-letter queue
- reconciliation process

Never assume WhatsApp, AI, LiveKit, maps, or storage are always available.

---

# 52. WhatsApp Failure Handling

If outbound message fails:

```text
store failure
retry safe failures
show delivery status in dashboard
alert operations for important failures
```

Order processing must not depend on a single outbound notification succeeding.

---

# 53. AI Failure Handling

If AI fails:

```text
retry once if safe
      ↓
use fallback parsing where possible
      ↓
ask customer to rephrase
      ↓
handoff to human support if necessary
```

AI failure must not corrupt cart/order state.

---

# 54. LiveKit Failure Handling

If private call fails:

```text
show call unavailable
allow retry
keep private chat available
log provider failure
```

Calling should never block delivery completion.

---

# 55. Observability

Use structured logs.

Recommended fields:

```text
request_id
user_id
customer_id
order_id
conversation_id
merchant_id
driver_id
provider
duration_ms
status
error_code
```

Metrics:

```text
API latency
error rate
queue depth
WhatsApp failures
AI latency
AI failures
LiveKit failures
order creation rate
order completion rate
```

Alerts should be configured for abnormal behavior.

---

# 56. Testing Strategy

## Unit Tests

Test:

- calculations
- business rules
- status transitions
- promotion rules
- finance calculations
- search ranking helpers
- permission logic

## Integration Tests

Test:

- database repositories
- API controllers
- WhatsApp event normalization
- AI structured output validation
- dispatch locking
- settlement calculation

## End-to-End Tests

Critical workflows:

```text
customer search → cart → confirmation → merchant → driver → delivered

merchant rejection → alternative → customer approval

driver rejection → next driver

customer support handoff

refund

private driver/customer messaging
```

---

# 57. Production Acceptance Tests

Before launch verify:

- WhatsApp inbound messages
- WhatsApp outbound messages
- text ordering
- Arabic
- Arabizi
- image ordering
- voice ordering
- video ordering
- address saving
- product search
- cart
- merchant accept/reject
- driver accept/reject
- pickup
- delivery
- customer-driver relay
- LiveKit call
- recording
- support takeover
- finance calculations
- analytics
- permissions
- audit logs

---

# 58. Database Transactions

Use transactions for:

```text
order confirmation
driver assignment
order completion
cash collection
refund
merchant settlement
driver settlement
financial ledger updates
```

Avoid partial financial updates.

---

# 59. Database Indexing

Important indexes:

```text
customers.whatsapp_number
orders.order_number
orders.status
orders.created_at
orders.customer_id
orders.merchant_branch_id
orders.driver_id
messages.provider_message_id
merchant_products.merchant_branch_id
merchant_products.product_id
merchant_product_availability.is_available
driver_assignments.order_id
driver_assignments.driver_id
support_cases.status
financial_transactions.order_id
audit_logs.entity_type + entity_id
```

---

# 60. Backups

Recommended:

- automated MySQL backups
- encrypted backups
- daily backups
- multiple retention points
- restore testing
- object-storage lifecycle policy

A backup is not valid until restore has been tested.

---

# 61. Environment Configuration

Example:

```env
NODE_ENV=production
PORT=3000

APP_URL=
DASHBOARD_URL=

DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=

REDIS_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_BUSINESS_ACCOUNT_ID=
META_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=

AI_API_KEY=
AI_CUSTOMER_MODEL=
AI_DASHBOARD_MODEL=

LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_KEY=
OBJECT_STORAGE_SECRET=

MAPS_API_KEY=

CORS_ORIGIN=
```

---

# 62. Deployment Architecture

Recommended production architecture:

```text
INTERNET
   |
   v
NGINX
   |
   +----------------------+
   |                      |
   v                      v
REACT DASHBOARD       NODE API
                          |
              +-----------+-----------+
              |           |           |
              v           v           v
            MYSQL       REDIS      WORKERS
                                      |
                         +------------+-------------+
                         |            |             |
                         v            v             v
                     WHATSAPP        AI          LIVEKIT
```

---

# 63. Recommended Deployment Strategy

For early production:

```text
1 application server
1 MySQL instance
1 Redis instance
object storage
HTTPS
daily backup
monitoring
```

As load grows:

```text
load balancer
multiple API instances
separate worker instances
managed MySQL
managed Redis
CDN / object storage
```

---

# 64. CI/CD

Recommended pipeline:

```text
push
 ↓
lint
 ↓
type check
 ↓
unit tests
 ↓
integration tests
 ↓
build
 ↓
deploy staging
 ↓
smoke tests
 ↓
manual approval
 ↓
production
```

---

# 65. Development Environments

Use:

```text
local
staging
production
```

Never test new WhatsApp/order/finance behavior directly in production.

---

# 66. Seed Data

Demo/staging seeds should include:

```text
3-5 merchants
30-100 products
multiple categories
3-5 drivers
sample customers
sample addresses
sample orders
promotions
```

---

# 67. Implementation Phases

## Phase 1 — Foundation

- project setup
- TypeScript configuration
- React dashboard setup
- Node backend setup
- MySQL connection
- Redis
- auth
- RBAC
- audit
- base API
- error handling
- logging

## Phase 2 — Merchant and Catalog

- merchants
- branches
- categories
- products
- variants
- aliases
- availability
- pricing
- merchant dashboard management

## Phase 3 — Customers and Addresses

- customers
- WhatsApp identity
- customer profiles
- saved addresses
- location
- building photo
- voice directions

## Phase 4 — WhatsApp Conversation Engine

- webhook
- message storage
- text
- image
- audio
- video
- conversation state
- AI integration
- intent detection
- structured outputs

## Phase 5 — Search and Recommendation

- exact search
- alias search
- semantic search
- merchant filters
- ranking
- basket comparison
- substitutions

## Phase 6 — Cart and Checkout

- carts
- cart items
- variants
- addons
- recalculation
- address selection
- final confirmation
- order creation

## Phase 7 — Merchant Order Workflow

- merchant notification
- accept
- reject
- preparing
- ready
- alternative merchant handling

## Phase 8 — Driver and Dispatch

- driver management
- availability
- driver offers
- accept/reject
- assignment locks
- pickup
- delivered

## Phase 9 — Private Communication

- private driver/customer chat relay
- voice relay
- images
- channel expiration
- dashboard communication viewer

## Phase 10 — LiveKit Calling

- call request
- private bridge
- permissions
- recording
- transcript
- dashboard playback

## Phase 11 — Support

- support cases
- human takeover
- complaints
- issue management
- resolution workflow

## Phase 12 — Finance

- order financial snapshot
- ledger
- cash reconciliation
- refunds
- merchant balance
- driver balance
- settlements

## Phase 13 — Analytics

- operational metrics
- customer analytics
- merchant analytics
- driver analytics
- AI analytics
- WhatsApp analytics
- finance analytics

## Phase 14 — Management AI

- read-only analytics tools
- natural-language queries
- summaries
- comparisons
- dashboard filtering

## Phase 15 — Production Hardening

- security audit
- performance
- load testing
- provider failure handling
- backup validation
- observability
- full workflow audit
- production acceptance testing

---

# 68. Definition of Done

The system is not considered production-ready until:

- all critical workflows are complete
- all role permissions are enforced
- WhatsApp webhook handling is idempotent
- order state transitions are validated
- driver assignment cannot duplicate
- prices are revalidated before confirmation
- financial operations are transactional
- audit logs exist for sensitive actions
- media access is secured
- customer-driver privacy is enforced
- calls and recordings follow configured policy
- backups are verified
- automated tests pass
- staging acceptance tests pass
- production smoke tests pass
- monitoring and alerting are active

---

# 69. Initial Production Scope Recommendation

For Lion Delivery's first production release, prioritize:

## Customer

- WhatsApp ordering
- Arabic / Arabizi / English
- text
- image
- voice
- product search
- cart
- addresses
- order confirmation
- tracking

## Merchant

- accept
- reject
- preparing
- ready

## Driver

- accept
- reject
- picked up
- delivered
- private customer chat

## Dashboard

- orders
- live operations
- customers
- merchants
- products
- drivers
- dispatch
- conversations
- support
- basic finance
- basic analytics

Then add:

```text
LiveKit calling
recording
advanced finance
advanced analytics
management AI
promotions
loyalty
```

in controlled releases.

---

# 70. Final Technical Outcome

The finished Lion Delivery system should provide one integrated technical platform where:

```text
WHATSAPP CUSTOMER
       ↓
AI UNDERSTANDING
       ↓
PRODUCT / MERCHANT SEARCH
       ↓
CART
       ↓
ADDRESS
       ↓
ORDER
       ↓
MERCHANT
       ↓
DISPATCH
       ↓
DRIVER
       ↓
PRIVATE COMMUNICATION / CALLING
       ↓
DELIVERY
       ↓
FINANCE
       ↓
ANALYTICS
       ↓
MANAGEMENT DASHBOARD
```

The React dashboard provides the operational control layer.

The Node.js + TypeScript backend owns all business logic.

MySQL is the primary source of truth.

Redis supports high-speed state, queues, locks, and real-time coordination.

AI assists with understanding and analysis but does not own critical operational or financial truth.

This architecture allows Lion Delivery to begin as a small operation while remaining capable of scaling to a much larger delivery business without redesigning the entire platform.
