# Lion Delivery
## Full Demo Implementation Plan
### WhatsApp-First AI Delivery Demo
### React + Vite + TypeScript | Node.js + TypeScript | MySQL

---

# 1. Demo Objective

Build a polished, reliable, client-facing demo of the Lion Delivery platform that proves the core business concept without attempting to implement the entire production platform.

The demo must clearly demonstrate that:

- A customer can interact naturally with Lion Delivery through WhatsApp.
- The AI understands Arabic, Lebanese Arabic, Arabizi, English, and mixed-language messages.
- The AI maintains multi-turn conversation context.
- The customer can search for products without knowing which merchant sells them.
- The system can compare merchants and prices.
- The customer can build and edit a cart naturally.
- The customer can use saved addresses.
- The customer can confirm an order.
- The order appears in the Lion Delivery dashboard.
- A merchant can accept or reject the order.
- A driver can accept or reject the delivery.
- The driver can mark Picked Up and Delivered.
- The customer and driver can communicate privately through Lion Delivery.
- Basic analytics and a small management AI experience can be shown at the end.

The demo is not the final production release.

The purpose is to prove the concept, validate the customer experience, and support the client presentation.

---

# 2. Relationship to the Full Project

The demo must reuse the same core architecture intended for production.

Use the same stack:

```text
React + Vite + TypeScript
Node.js + TypeScript
MySQL
Official WhatsApp Business Platform / Cloud API
AI integration
```

Where useful, also use:

```text
Redis
Background jobs
WebSocket / Socket.IO
Object storage
```

Do not create a disposable prototype that must later be completely rewritten.

The demo should become the foundation for the production platform.

---

# 3. Mandatory Source Documents

Before implementation, read:

```text
Lion_Delivery_Full_Business_Documentation.md
Lion_Delivery_Full_Technical_Documentation.md
Lion_Delivery_Full_MySQL_Database.sql
Lion_Delivery_Master_Implementation_Plan.md
Lion_Delivery_Project_Kickoff_Message.md
```

The demo implementation plan narrows the scope of those documents.

Do not implement unnecessary production modules until the demo is complete.

---

# 4. Demo Scope

## Included

### Customer WhatsApp

- text messages
- Arabic
- Lebanese Arabic
- Arabizi
- English
- mixed language
- multi-turn context
- product search
- merchant comparison
- budget awareness
- follow-up questions
- corrections
- quantity changes
- cart updates
- saved addresses
- order confirmation
- order status
- voice-note understanding
- image understanding

### Product / Merchant Search

- search across demo merchants
- aliases
- approximate/semantic matching
- cheapest
- fastest
- best rated
- best value
- basket comparison
- no-result handling
- alternatives

### Order

- cart
- cart updates
- checkout
- final total
- order creation
- order status

### Merchant

- accept
- reject
- preparing
- ready

### Driver

- accept
- reject
- picked up
- delivered
- private chat with customer

### Dashboard

- live orders
- customers
- merchants
- products
- drivers
- current order detail
- merchant action
- driver action
- communication history
- basic analytics

### Management AI

Small demo only:

- orders today
- completed orders
- merchant rejection
- driver performance
- unavailable product demand
- daily summary

---

# 5. Explicitly Out of Demo Scope

Do not delay the demo for:

```text
full merchant settlements
full driver settlements
complete finance ledger
advanced refund engine
loyalty program
advanced promotion engine
advanced audit governance
complex report builder
large-scale performance optimization
multi-region architecture
advanced accounting
advanced call center
large role matrix
production-grade disaster recovery
deep marketing automation
full LiveKit calling implementation
```

If private calling is not ready, the demo may show the intended action/button and explain that production will connect it through the private calling layer.

Private text relay should be real if possible.

---

# 6. Demo Success Criteria

The demo is successful if the following flow works consistently:

```text
CUSTOMER SENDS WHATSAPP MESSAGE
        ↓
AI UNDERSTANDS NATURAL REQUEST
        ↓
SYSTEM SEARCHES DEMO MERCHANTS
        ↓
AI PRESENTS OPTIONS
        ↓
CUSTOMER ASKS FOLLOW-UP QUESTION
        ↓
AI REMEMBERS CONTEXT
        ↓
CUSTOMER SELECTS
        ↓
CUSTOMER MODIFIES CART NATURALLY
        ↓
CUSTOMER SELECTS SAVED ADDRESS
        ↓
SYSTEM SHOWS VERIFIED TOTAL
        ↓
CUSTOMER CONFIRMS
        ↓
ORDER APPEARS IN DASHBOARD
        ↓
MERCHANT ACCEPTS
        ↓
DRIVER ACCEPTS
        ↓
PICKED UP
        ↓
PRIVATE CHAT
        ↓
DELIVERED
        ↓
ANALYTICS UPDATE
        ↓
MANAGEMENT AI ANSWERS A BUSINESS QUESTION
```

---

# 7. Demo Data Set

Keep data controlled and realistic.

Seed:

```text
3 restaurants
1 supermarket
20–30 products
2 customers
2 saved addresses
3 drivers
10–20 historical orders
3–5 completed orders today
2 rejected merchant orders
1 unavailable product example
2 customer support examples
```

Example merchant types:

```text
Chicken / burgers
Pizza / sandwiches
Desserts / café
Supermarket
```

Example products:

```text
Crispy Chicken Meal
Chicken Burger
French Fries
Coke
Coke Zero
Water
Pizza
Chocolate
Nutella
Milk
Bread
Chips
Ice Cream
```

Seed Arabic, English, and Arabizi aliases.

---

# 8. Demo Environment

Create:

```text
LOCAL
DEMO / STAGING
```

Production environment is not required for the client demo.

The demo environment should have:

- MySQL
- Node.js backend
- React dashboard
- WhatsApp test or demo number
- AI credentials
- Redis if used
- object storage if media is included

---

# 9. Phase 0 — Demo Baseline and Repository Audit

## Goal

Understand the existing project and prepare only what the demo needs.

## Tasks

- inspect repository
- identify existing frontend
- identify existing backend
- load project documentation
- load MySQL schema
- identify reusable modules
- remove no working code
- create demo backlog
- define demo acceptance scenarios
- define demo seed dataset

## Deliverables

- working local environment
- database imported
- frontend runs
- backend runs
- environment variables documented
- demo backlog created

## Exit Criteria

Do not continue until:

```text
frontend starts
backend starts
database connects
basic health endpoint works
```

---

# 10. Phase 1 — Demo Backend Foundation

## Goal

Create a stable but lightweight backend foundation.

## Implement

- Node.js + TypeScript
- API server
- configuration
- MySQL connection
- error handling
- request validation
- logging
- API response standard
- simple authentication for dashboard
- seed command
- health check

## Minimal Security

Implement:

- dashboard login
- protected dashboard routes
- password hashing
- basic role check

Do not build the entire production RBAC matrix yet.

## Exit Criteria

Backend can support the demo modules without mock-only APIs.

---

# 11. Phase 2 — Demo Dashboard Foundation

## Goal

Create the client-facing Lion Delivery dashboard.

## Build

Routes:

```text
/login
/dashboard
/orders
/customers
/merchants
/products
/drivers
/conversations
/analytics
/management-ai
```

## Dashboard Navigation

Keep navigation simple.

Recommended:

```text
Overview
Live Orders
Customers
Merchants
Products
Drivers
Conversations
Analytics
AI Assistant
```

## Required Components

- tables
- filters
- status badges
- modal
- order drawer/detail
- basic charts
- message timeline

## Exit Criteria

All demo pages route correctly and share a consistent Lion Delivery design.

---

# 12. Phase 3 — Demo Merchants and Products

## Goal

Create real business data for AI search.

## Implement

Use the production schema for:

```text
merchants
merchant_branches
categories
products
product_aliases
merchant_products
product_variants
merchant_product_addons
```

## Seed

Create realistic demo data.

Each product should include:

- name
- Arabic name where useful
- price
- merchant
- availability
- category
- rating context
- delivery estimate context

## Product Aliases

Examples:

```text
crispy chicken
crispy
كرسبي
كريسبي
djej crispy
crispy djej
coke zero
coca zero
كولا زيرو
```

## Exit Criteria

Dashboard can display and edit demo merchants and products.

---

# 13. Phase 4 — Customer and Saved Address Demo

## Goal

Support repeatable ordering and address selection.

## Implement

Use:

```text
customers
customer_addresses
customer_preferences
```

## Seed

Customer 1:

```text
Name: Demo Customer
WhatsApp: demo number
Address:
Home
Saida
map coordinates
building
floor
entrance image
voice directions optional
```

Customer 2:

Secondary demo profile.

## WhatsApp Behaviors

Customer should be able to say:

```text
home
3al bet
same address
```

and select the saved Home address.

## Exit Criteria

The system can identify the customer from WhatsApp and retrieve saved addresses.

---

# 14. Phase 5 — WhatsApp Business Integration

## Goal

Make the real demo happen through WhatsApp.

## Implement

Official WhatsApp Business / Cloud API.

Inbound:

```text
text
image
audio
location
```

Optional:

```text
video
```

## Webhook Flow

```text
WhatsApp
    ↓
Webhook
    ↓
Verify
    ↓
Store
    ↓
Identify customer
    ↓
Conversation engine
```

## Required

- inbound messages
- outbound replies
- message status
- duplicate webhook protection
- basic retry

## Exit Criteria

A message from the test customer reaches the backend and receives a real reply.

---

# 15. Phase 6 — AI Conversation Engine

## Goal

This is the most important phase of the demo.

The AI must feel like a smart Lion Delivery employee.

## Required Language Support

```text
Arabic
Lebanese Arabic
Arabizi
English
mixed Arabic/English
```

## Required Conversation Behavior

The AI must understand follow-up messages without restarting the flow.

Example:

```text
Customer:
bade crispy chicken bas ma bade aktar men 15$

AI:
shows options

Customer:
which one is best rated?

AI:
compares current options

Customer:
okay add the second one bas without pickles

AI:
updates current selection

Customer:
add coke zero

AI:
updates cart

Customer:
actually make it one meal

AI:
updates quantity

Customer:
large

AI:
asks:
Do you mean the drink or the meal?

Customer:
the coke

AI:
updates Coke size
```

## Required Intents

```text
SEARCH_PRODUCTS
COMPARE_RESULTS
SELECT_RESULT
ADD_TO_CART
REMOVE_FROM_CART
UPDATE_QUANTITY
UPDATE_VARIANT
ADD_NOTE
CHECK_PRICE
CHECK_BUDGET
SELECT_ADDRESS
CHECKOUT
ORDER_STATUS
CONTACT_SUPPORT
UNKNOWN
```

## Structured AI Output

AI must not directly modify data.

Example:

```json
{
  "intent": "UPDATE_QUANTITY",
  "target": "crispy meal",
  "quantity": 1,
  "confidence": 0.96,
  "needsClarification": false
}
```

Backend executes the change.

## Clarification

When uncertain:

```text
DO NOT GUESS
```

Example:

```text
Customer:
large

AI:
Do you mean the Coke or the meal?
```

## Exit Criteria

The full scripted multi-turn conversation passes repeatedly.

---

# 16. Phase 7 — Search and Merchant Recommendation

## Goal

Turn natural language requests into real merchant/product results.

## Search Layers

Implement:

```text
exact match
normalized text
alias match
full-text
semantic similarity if available
```

Then filter by:

```text
availability
merchant active
merchant open
delivery eligibility
```

## Ranking

Support:

```text
cheapest
fastest
best rated
best value
```

## Result Example

```text
1. Chicken House
   Crispy Meal
   $10.50
   Delivery $1.50
   25 min

2. Burger Spot
   Double Crispy Meal
   $12.00
   Delivery $1
   20 min
```

## Exit Criteria

Demo queries return deterministic, believable results.

---

# 17. Phase 8 — Basket Comparison

## Goal

Demonstrate supermarket-style intelligence.

## Example Request

```text
bade:
2 coke zero
milk
bread
lays
```

The system compares available merchants.

## Calculate

```text
item total
delivery fee
discount
final basket total
basket completeness
```

## Output

Show:

```text
Cheapest complete basket
Fastest complete basket
Best value
```

## Exit Criteria

AI does not compare individual product prices only.

---

# 18. Phase 9 — Cart and Multi-Turn Editing

## Goal

Allow natural cart changes.

## Required Actions

```text
add item
remove item
change quantity
change size
add extras
remove ingredients
add note
clear cart
review cart
```

## Natural Examples

```text
make it two
remove the coke
without pickles
add fries
make the coke large
no, regular
change the second one
```

## Budget Awareness

If original customer budget was:

```text
$15
```

and cart becomes:

```text
$15.50
```

AI should mention the budget was exceeded.

## Exit Criteria

Cart always matches the backend state after every natural-language edit.

---

# 19. Phase 10 — Voice Note Understanding

## Goal

Show that voice behaves like text.

## Demo Example

Customer sends a voice note:

```text
bade 2 coke zero w lays salt w shufle arkhass mahal
```

## Processing

```text
WhatsApp audio
    ↓
store/download
    ↓
AI understands/transcribes
    ↓
structured request
    ↓
search
    ↓
reply
```

## Required

Voice request must use the same conversation state as text.

## Exit Criteria

Customer can switch between text and voice without losing context.

---

# 20. Phase 11 — Image Understanding

## Goal

Show visual ordering.

## Supported Demo

Customer sends:

- product photo
- screenshot
- simple shopping-list image
- handwritten list if AI quality is reliable

## Example

Customer sends product image:

```text
do they have this?
```

The AI must understand that:

```text
"they"
```

refers to the currently selected merchant.

## Exit Criteria

Image input continues the existing conversation rather than starting a new unrelated flow.

---

# 21. Phase 12 — Checkout and Order Confirmation

## Goal

Convert the AI conversation into a real order.

## Flow

```text
cart ready
    ↓
select saved address
    ↓
revalidate products
    ↓
revalidate prices
    ↓
calculate delivery fee
    ↓
show final summary
    ↓
customer confirms
    ↓
create order
```

## Final Summary

Show:

```text
merchant
items
quantities
notes
delivery fee
final total
address
estimated time
```

## Exit Criteria

Customer confirmation creates exactly one order.

---

# 22. Phase 13 — Dashboard Live Order

## Goal

Immediately show the client that WhatsApp is connected to operations.

## When Confirmed

Dashboard should receive:

```text
NEW ORDER
```

without requiring manual refresh if possible.

## Order Detail

Show:

- order number
- customer reference
- merchant
- products
- total
- address
- status
- timeline

## Exit Criteria

WhatsApp order appears in dashboard reliably.

---

# 23. Phase 14 — Merchant Demo Workflow

## Goal

Show merchant operational response without overbuilding merchant software.

## For Demo

Use dashboard controls:

```text
ACCEPT
REJECT
PREPARING
READY
```

## Customer Updates

When merchant accepts:

```text
Your order has been accepted.
```

When preparing:

```text
Your order is being prepared.
```

## Rejection Demo

Optional second scenario:

```text
Merchant rejects
    ↓
system finds alternative
    ↓
customer approves
```

## Exit Criteria

Merchant actions update order status and customer messages.

---

# 24. Phase 15 — Driver Demo Workflow

## Goal

Show simple driver operations.

## Driver Interface

Can be:

```text
Driver WhatsApp
```

or a very small driver web/mobile test page if WhatsApp driver flow is slower to prepare.

Preferred demo actions:

```text
ACCEPT
REJECT
PICKED UP
DELIVERED
CHAT CUSTOMER
```

## Display

- merchant
- pickup location
- customer delivery location
- amount to collect
- delivery notes

## Exit Criteria

Driver accepts and order status updates.

---

# 25. Phase 16 — Private Customer ↔ Driver Chat

## Goal

Demonstrate privacy.

## Flow

```text
Driver:
I'm outside

    ↓

Lion Delivery

    ↓

Customer:
Driver: I'm outside
```

Customer replies:

```text
second entrance
```

Driver receives it.

## Important

Do not expose:

```text
customer personal number
driver personal number
```

## Dashboard

Show the conversation history associated with the order.

## Exit Criteria

Two-way private relay works for the active order.

---

# 26. Phase 17 — Delivered and Feedback

## Goal

Complete the full story.

## Driver

Press:

```text
DELIVERED
```

## Customer

Receives:

```text
Your order has been delivered.
How was your experience?
```

## Store

Basic rating.

## Dashboard

Order becomes:

```text
DELIVERED
```

## Exit Criteria

The full golden-path order is complete.

---

# 27. Phase 18 — Demo Analytics

## Goal

Show management value without building the full production analytics platform.

## Overview Metrics

Display:

```text
Orders Today
Completed
Active
Cancelled
Revenue
Average Order Value
Average Delivery Time
Active Drivers
Active Merchants
WhatsApp Conversations
Conversion Rate
```

## Seed Historical Data

Enough historical records must exist so the analytics look realistic.

## Exit Criteria

Analytics numbers come from demo database data, not hardcoded UI values.

---

# 28. Phase 19 — Demo Management AI

## Goal

End the presentation with a management AI experience.

## Questions to Support

```text
How many orders did we complete today?

Which merchant rejected the most orders?

Which driver completed the most deliveries?

Which products are customers searching for that are unavailable?

Give me today's business summary.
```

## Implementation

Use controlled functions.

Example:

```text
question
    ↓
AI identifies analytics intent
    ↓
backend query/function
    ↓
data result
    ↓
AI explains
```

Do not let AI run arbitrary SQL.

## Exit Criteria

All prepared demo questions return correct values from the database.

---

# 29. Phase 20 — Demo Conversation Test Pack

## Goal

Test the main AI value proposition thoroughly.

Create a test pack covering at least:

## Test 1 — Budget Search

```text
bade crispy chicken under 15$
```

## Test 2 — Context

```text
which one is best rated?
```

## Test 3 — Selection

```text
add the second one
```

## Test 4 — Modification

```text
without pickles
```

## Test 5 — Additional Item

```text
add coke zero
```

## Test 6 — Correction

```text
actually make it one meal
```

## Test 7 — Ambiguity

```text
large
```

Expected:

```text
clarification
```

## Test 8 — Arabizi

```text
bade shi 7elo bas ma ykoun ghale
```

## Test 9 — Arabic

```text
بدي شي حلو تحت ٣ دولار
```

## Test 10 — Mixed Language

```text
anything chocolate bas under 3$
```

## Test 11 — Voice

Voice shopping list.

## Test 12 — Image

Product photo.

## Test 13 — Merchant Comparison

```text
is there somewhere cheaper?
```

## Test 14 — Address

```text
3al bet
```

## Test 15 — Checkout

```text
confirm
```

All 15 must work before client presentation.

---

# 30. Phase 21 — Demo Failure Handling

## Goal

Avoid embarrassing failures during the presentation.

Handle:

```text
AI timeout
invalid AI output
no product result
merchant unavailable
price changed
WhatsApp send failure
driver rejects
duplicate customer message
```

## Fallback Messages

Prepare safe customer-facing responses.

Example:

```text
I couldn't match that confidently.
Can you tell me which item you mean?
```

Never display raw errors to the customer.

---

# 31. Phase 22 — Demo Rehearsal Mode

## Goal

Make the demo repeatable.

Create a reset function or seed command that restores:

```text
customer cart
demo order statuses
driver availability
merchant availability
historical analytics
conversation state
```

Example:

```text
npm run demo:reset
```

or equivalent.

## Why

After one rehearsal, data should not ruin the next presentation.

## Exit Criteria

The full demo can be reset and replayed in minutes.

---

# 32. Phase 23 — Full Demo Rehearsal

Run the exact client demo from beginning to end.

## Main Demo

```text
1. Customer sends natural WhatsApp request
2. AI gives options
3. Customer asks follow-up
4. AI remembers context
5. Customer adds item
6. Customer corrects quantity
7. AI asks clarification
8. Customer selects Home
9. Order confirmed
10. Dashboard receives order
11. Merchant accepts
12. Merchant preparing
13. Driver accepts
14. Driver picks up
15. Private driver/customer chat
16. Driver delivers
17. Customer rating
18. Dashboard analytics
19. Management AI
```

## Extra Proof

Then demonstrate:

```text
voice request
image request
Arabizi request
Arabic request
```

## Exit Criteria

Run the complete demo successfully at least three consecutive times.

---

# 33. Client Presentation Order

Do not begin with technical architecture.

Present in this order:

```text
1. Customer WhatsApp
2. Natural AI conversation
3. Search and recommendation
4. Context and cart changes
5. Address
6. Order confirmation
7. Dashboard
8. Merchant
9. Driver
10. Private chat
11. Delivered
12. Analytics
13. Management AI
```

The AI conversation is the centerpiece.

---

# 34. Demo Time Allocation

Recommended:

```text
AI WhatsApp conversation      60–70%
Order operations              20–25%
Analytics / management AI     10–15%
```

Do not spend most of the meeting explaining dashboard menus.

---

# 35. Most Important Demo Message

The core client message should be:

> The customer does not need to understand Lion Delivery's system. Lion Delivery's AI understands the customer.

The customer should feel like they are messaging a smart employee, not operating a chatbot menu.

---

# 36. AI Demo Quality Rules

The AI should:

- answer naturally
- remain concise
- remember current context
- understand corrections
- understand pronouns where context is clear
- ask clarification when context is not clear
- preserve budget context
- preserve merchant context
- preserve cart context
- preserve address context

The AI should not:

- invent prices
- invent products
- invent merchants
- claim availability without database confirmation
- silently substitute products
- guess when ambiguous

---

# 37. Demo Data Integrity Rules

Even though this is a demo:

```text
prices must come from DB
products must come from DB
merchants must come from DB
cart totals must be calculated by backend
order status must be persisted
analytics must use stored data
```

Do not fake the most important business behaviors.

---

# 38. What Can Be Simplified

The following may be simplified for demo:

```text
merchant interface
driver interface
authentication
analytics depth
support
calling
finance
reports
permissions
```

But they must not misrepresent the intended production behavior.

---

# 39. What Must Be Real

The following should be real:

```text
WhatsApp inbound/outbound
AI understanding
multi-turn context
search
merchant/product data
cart
price calculation
address selection
order creation
order status
merchant acceptance
driver acceptance
private chat if shown
analytics values shown
management AI answers shown
```

---

# 40. Demo Completion Checklist

## Environment

- [ ] backend runs
- [ ] dashboard runs
- [ ] MySQL runs
- [ ] demo seed works
- [ ] WhatsApp connected
- [ ] AI connected

## Customer AI

- [ ] Arabic
- [ ] Arabizi
- [ ] English
- [ ] mixed language
- [ ] context memory
- [ ] clarification
- [ ] correction
- [ ] budget awareness
- [ ] product comparison

## Media

- [ ] voice
- [ ] image
- [ ] location

## Search

- [ ] product search
- [ ] aliases
- [ ] merchant comparison
- [ ] cheapest
- [ ] fastest
- [ ] best rated
- [ ] basket comparison
- [ ] no-result response

## Cart

- [ ] add
- [ ] remove
- [ ] quantity
- [ ] variant
- [ ] notes
- [ ] final calculation

## Address

- [ ] saved address
- [ ] home phrase
- [ ] location
- [ ] address detail

## Order

- [ ] confirmation
- [ ] create exactly once
- [ ] appears in dashboard
- [ ] timeline works

## Merchant

- [ ] accept
- [ ] reject
- [ ] preparing
- [ ] ready

## Driver

- [ ] accept
- [ ] reject
- [ ] picked up
- [ ] delivered

## Communication

- [ ] private customer-driver message
- [ ] no number exposure
- [ ] conversation visible in dashboard

## Analytics

- [ ] order metrics
- [ ] revenue
- [ ] merchant metric
- [ ] driver metric
- [ ] WhatsApp metric

## Management AI

- [ ] order question
- [ ] merchant question
- [ ] driver question
- [ ] unavailable products question
- [ ] business summary

## Rehearsal

- [ ] reset works
- [ ] main demo passes three times
- [ ] backup demo scenario prepared

---

# 41. Demo Definition of Done

The demo is complete only when this entire flow is stable:

```text
CUSTOMER WHATSAPP
        ↓
NATURAL MULTI-TURN AI
        ↓
REAL PRODUCT SEARCH
        ↓
REAL MERCHANT OPTIONS
        ↓
CART EDITING
        ↓
SAVED ADDRESS
        ↓
VERIFIED TOTAL
        ↓
ORDER CONFIRMATION
        ↓
DASHBOARD
        ↓
MERCHANT ACCEPT
        ↓
DRIVER ACCEPT
        ↓
PICKED UP
        ↓
PRIVATE CHAT
        ↓
DELIVERED
        ↓
ANALYTICS
        ↓
MANAGEMENT AI
```

The demo should also prove:

```text
TEXT
VOICE
IMAGE
ARABIC
ARABIZI
ENGLISH
MIXED LANGUAGE
CONTEXT
CLARIFICATION
CORRECTIONS
```

---

# 42. Final Execution Rule

For every demo phase:

```text
BUILD
  ↓
TEST
  ↓
FIX
  ↓
REPLAY DEMO
  ↓
CONTINUE
```

Do not wander into production-only features before the main demo flow is stable.

The priority order is:

```text
1. AI conversation quality
2. WhatsApp reliability
3. Search correctness
4. Cart/context reliability
5. Order flow
6. Merchant/driver flow
7. Private chat
8. Analytics
9. Management AI
```

The final objective is:

# A SHORT, POLISHED, RELIABLE LION DELIVERY DEMO THAT MAKES THE AI WHATSAPP EXPERIENCE THE MAIN SELLING POINT.
