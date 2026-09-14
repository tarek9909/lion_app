# Lion Delivery — Full Project Kickoff Message

You are responsible for implementing the **entire Lion Delivery platform from end to end**.

Your goal is not to partially build screens, create placeholders, or stop after scaffolding. Your goal is to complete the full production-ready system according to the approved project documentation, verify every phase, fix all issues found, and continue until the entire platform is ready for production testing and deployment.

---

## 1. Primary Goal

Build the complete Lion Delivery WhatsApp-first delivery operations platform using the approved architecture and implementation plan.

The final system must support the complete business flow:

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
PRIVATE CUSTOMER ↔ DRIVER COMMUNICATION
        ↓
PRIVATE CALLING / RECORDING
        ↓
DELIVERY
        ↓
PAYMENT / CASH
        ↓
SUPPORT
        ↓
REFUNDS / SETTLEMENTS
        ↓
ANALYTICS
        ↓
MANAGEMENT DASHBOARD
        ↓
MANAGEMENT AI ASSISTANT
```

Do not stop until all required phases are complete, tested, audited, fixed, and integrated.

---

# 2. Mandatory Source Documents

Before making changes, read and analyze all approved project documents.

Treat them as the source of truth.

You must locate and use:

```text
Lion_Delivery_Full_Business_Documentation.md
Lion_Delivery_Full_Technical_Documentation.md
Lion_Delivery_Full_MySQL_Database.sql
Lion_Delivery_Master_Implementation_Plan.md
```

Read all four completely before implementation.

Do not begin coding from assumptions.

Create a traceability understanding between:

```text
BUSINESS REQUIREMENT
        ↓
TECHNICAL MODULE
        ↓
DATABASE TABLES
        ↓
BACKEND API
        ↓
DASHBOARD / WHATSAPP FLOW
        ↓
TEST
```

If the repository already contains work, audit it against the documentation before modifying it.

---

# 3. Required Technology Stack

The project must use:

## Dashboard

```text
React
Vite
TypeScript
```

Recommended supporting libraries may include:

```text
React Router
TanStack Query
Zustand or Redux Toolkit where needed
WebSocket / Socket.IO client
Charting library
Form validation library
Reusable component system
```

## Backend

```text
Node.js
TypeScript
MySQL 8+
REST APIs
WebSocket / Socket.IO
Redis
Background job queues
```

## Required Integrations

```text
Official Meta WhatsApp Business Platform / Cloud API
AI provider integration
LiveKit
Object storage
Maps / geolocation provider
```

The approved business behavior must not depend on a customer mobile application.

The customer experience is WhatsApp-first.

---

# 4. Critical Architectural Rules

These rules are mandatory.

## 4.1 AI Is Not the Source of Truth

AI may:

- understand Arabic
- understand Lebanese Arabic
- understand Arabizi
- understand English
- understand mixed-language requests
- understand text
- understand images
- understand voice notes
- understand video
- extract products
- extract quantities
- detect preferences
- interpret intent
- explain search results
- summarize analytics

AI must never independently decide:

```text
product price
product availability
merchant availability
delivery fee
order total
refund amount
merchant balance
driver balance
settlement value
permissions
driver ownership
```

These values must always come from backend business logic and persistent data.

---

## 4.2 Database Is the Operational Source of Truth

Do not rely on:

- AI memory
- frontend state
- WhatsApp message history

for important business state.

Explicitly persist:

```text
conversation state
cart
selected products
selected merchant
customer address
order
merchant response
driver assignment
financial snapshot
refund
settlement
support case
```

---

## 4.3 Idempotency Is Mandatory

Protect all important business actions from duplicate execution.

Examples:

```text
duplicate WhatsApp webhook
duplicate customer confirmation
duplicate merchant accept
duplicate driver accept
duplicate picked-up action
duplicate delivered action
duplicate refund callback
duplicate financial transaction
```

Duplicate events must not create duplicate business records.

---

## 4.4 Financial Operations Must Be Transactional

Finance must never be implemented using approximate derived totals only.

Use the approved:

```text
financial ledger
order financial snapshot
merchant balances
driver balances
refunds
merchant settlements
driver settlements
cash reconciliation
```

All financial changes must be:

```text
transactional
auditable
reproducible
protected from duplication
```

---

## 4.5 Privacy Is Mandatory

Customer and driver must not see each other's:

```text
private phone number
private WhatsApp number
private identity unless explicitly required
```

Private communication must be routed through Lion Delivery.

The dashboard may view authorized communication history according to permissions.

---

## 4.6 Driver Experience Must Remain Simple

Do not overbuild the driver experience.

Required driver actions:

```text
ACCEPT
REJECT
PICKED UP
DELIVERED
CHAT CUSTOMER
CALL CUSTOMER
REPORT ISSUE
```

The driver must receive the necessary:

```text
pickup information
delivery location
building photo
voice directions
delivery notes
cash amount
```

without requiring a large dedicated app for the initial platform.

---

# 5. Implementation Method

Follow the approved master implementation plan exactly.

The required phase order is:

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

Do not randomly jump between phases unless a dependency requires it.

---

# 6. Mandatory Workflow for Every Phase

For every single phase:

```text
ANALYZE
  ↓
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

Do not mark a phase complete because:

- files exist
- APIs return mock data
- UI looks finished
- happy path works
- compilation succeeds

A phase is complete only when its entire defined scope is working.

---

# 7. Before Implementing Each Phase

For each phase:

1. Read the exact phase scope from the master implementation plan.
2. Identify relevant business requirements.
3. Identify relevant database tables.
4. Identify existing code that already supports the phase.
5. Identify missing work.
6. Identify dependencies.
7. Identify tests required.
8. Implement only after understanding the complete phase.

Do not duplicate existing working architecture.

Reuse existing:

```text
components
services
repositories
middleware
validators
hooks
utilities
types
```

where appropriate.

---

# 8. Database Rules

Use:

```text
Lion_Delivery_Full_MySQL_Database.sql
```

as the initial database model.

Do not silently edit production schema.

Use migrations for all schema changes after the initial baseline.

Every migration must be tested against:

```text
empty database
seeded database
existing staging data
```

Do not remove required tables or fields simply because they are not used yet.

Do not rewrite historical:

```text
completed order snapshots
financial history
audit logs
settlements
```

---

# 9. Backend Quality Standard

Every backend endpoint must include where applicable:

```text
route
authentication
authorization
validation
controller
service
repository/data access
transaction boundary
typed response
error handling
audit behavior
tests
```

No business logic should live directly inside route definitions.

Avoid duplicated business logic.

---

# 10. Frontend Quality Standard

Every completed dashboard module must support:

```text
loading state
empty state
error state
permissions
filters where needed
pagination where needed
forms
validation
API integration
success feedback
failure feedback
responsive layout
real-time updates where required
```

Do not create static fake screens and mark them finished.

---

# 11. WhatsApp Requirements

Implement official Meta WhatsApp Business Platform behavior.

Support:

```text
text
Arabic
Lebanese Arabic
Arabizi
English
mixed-language messages
images
voice notes
video
location
interactive replies
status callbacks
```

Webhook processing must include:

```text
signature verification
idempotency
raw event storage
normalization
queue processing
retry
failure logging
```

The customer must be identifiable by WhatsApp number.

---

# 12. Customer AI Requirements

The customer AI must support:

```text
product search
merchant search
quantity extraction
budget extraction
preferences
cart modification
address selection
order tracking
repeat order
support request
```

When uncertain:

```text
DO NOT GUESS
      ↓
ASK FOR CLARIFICATION
```

All AI structured outputs must be schema-validated before calling business functions.

---

# 13. Search Requirements

Search must support:

```text
exact match
normalized text
Arabic
English
Arabizi
aliases
spelling variations
semantic similarity
merchant availability
merchant open status
delivery-zone eligibility
price
ETA
rating
promotions
```

For supermarket-style orders, implement whole-basket comparison.

The cheapest single product is not automatically the cheapest basket.

---

# 14. Customer Address Requirements

Saved addresses must support:

```text
label
written address
map location
latitude
longitude
landmark
building
floor
apartment
entrance photo
voice directions
voice transcript
delivery notes
alternate contact
default address
```

Customer should be able to later say phrases such as:

```text
3al bet
home
same address
```

and have the saved address selected appropriately.

---

# 15. Order Requirements

Order creation must always:

```text
revalidate merchant
revalidate availability
revalidate price
recalculate delivery fee
recalculate promotions
calculate final total
show final confirmation
```

Only after confirmation may the final order be created.

Use order state transitions.

Prevent impossible transitions.

Every state change must be traceable.

---

# 16. Merchant Requirements

Merchant must support:

```text
ACCEPT
REJECT
PREPARING
READY
REPORT ITEM UNAVAILABLE
REPORT ISSUE
```

If rejected:

```text
save reason
search alternative
calculate alternative total
ask customer
continue only after approval
```

---

# 17. Driver and Dispatch Requirements

Dispatch must:

- identify eligible drivers
- rank candidates
- create timed offers
- process accept/reject
- move to next driver on rejection/timeout
- prevent duplicate ownership
- allow authorized manual reassignment

Use locking and/or transactional safeguards.

---

# 18. Private Customer ↔ Driver Messaging

Implement a privacy relay.

Flow:

```text
CUSTOMER
    ↓
LION DELIVERY
    ↓
DRIVER
```

and reverse.

Supported:

```text
text
image
voice
```

The channel must:

- be tied to one order
- open only for an active delivery
- close after delivery plus configured grace period
- prevent unrelated driver/customer access

---

# 19. LiveKit Calling Requirements

Implement private calling for active deliveries.

Support:

```text
CALL CUSTOMER
CALL DRIVER
```

The system must:

- verify the order
- verify the driver
- verify the customer
- verify the communication window
- protect identity
- store call history
- record only according to approved consent/policy
- store recording securely
- support transcript if enabled

Calling failure must never prevent delivery completion.

---

# 20. Support Requirements

Support must support:

```text
AI escalation
human takeover
support inbox
cases
complaints
notes
actions
resolution
return to AI
```

Once a human takes over:

```text
AI MUST NOT SIMULTANEOUSLY REPLY
```

until the conversation is explicitly returned to automated mode.

---

# 21. Finance Requirements

Implement:

```text
order financial snapshots
financial accounts
financial transactions
financial entries
cash collection
merchant balances
driver balances
refunds
merchant settlements
driver settlements
cash reconciliation
```

Never calculate historical financial truth from current product prices.

Completed order financials must remain immutable snapshots.

---

# 22. Analytics Requirements

Implement analytics for:

```text
orders
customers
merchants
drivers
products
WhatsApp
AI
support
finance
```

Every KPI must have a documented formula.

Analytics must reconcile against underlying records.

---

# 23. Management AI Requirements

The dashboard management AI must be read-only by default.

It may answer:

```text
How many orders today?
Which merchant rejects most?
Which drivers perform best?
Why did cancellations increase?
Which products are searched but unavailable?
What is today's revenue?
Compare this week with last week.
```

It must use controlled analytics tools.

It must not:

```text
execute arbitrary SQL
issue refunds
modify prices
cancel orders
alter settlements
change permissions
```

---

# 24. Real-Time Dashboard Requirements

The operations dashboard must update live for:

```text
new order
merchant acceptance
merchant rejection
driver offer
driver assignment
pickup
delivery
support update
conversation message
operational alert
```

Operations must not need to refresh the page manually.

---

# 25. Required Testing

Testing is mandatory.

## Unit Tests

For:

```text
calculations
business rules
permissions
status transitions
promotion logic
finance
search/ranking helpers
```

## Integration Tests

For:

```text
database
repositories
controllers
WhatsApp normalization
AI structured output validation
dispatch locking
finance
settlements
```

## End-to-End Tests

At minimum test:

### Standard Restaurant Order

```text
customer text
→ search
→ selection
→ cart
→ address
→ confirm
→ merchant accept
→ driver accept
→ pickup
→ private chat
→ delivered
→ cash
```

### Grocery Image

```text
image
→ item extraction
→ supermarket comparison
→ order
```

### Voice Order

```text
voice
→ understand
→ clarify
→ order
```

### Merchant Rejection

```text
order
→ reject
→ alternative
→ customer approves
→ continue
```

### Driver Rejection

```text
driver A rejects
→ driver B timeout
→ driver C accepts
```

### Support

```text
issue
→ AI handoff
→ human takeover
→ resolve
```

### Refund

```text
delivered order
→ complaint
→ partial refund
→ finance update
```

### Private Call

```text
active order
→ private call
→ recording
→ history
```

---

# 26. Security Audit Requirements

Before production:

Audit:

```text
authentication
authorization
IDOR
SQL injection
XSS
CSRF where relevant
CORS
rate limiting
webhook forgery
file uploads
media access
recording access
session security
password handling
secrets
dependency vulnerabilities
```

No critical or high-severity security issue may remain unresolved.

---

# 27. Failure Testing

Intentionally test:

```text
MySQL outage
Redis outage
WhatsApp outage
AI timeout
AI malformed response
LiveKit outage
storage outage
duplicate webhook
duplicate driver action
worker crash
network interruption
```

Verify:

```text
no duplicate orders
no duplicate assignments
no duplicate refunds
no lost finance
no corrupted cart
no broken order state
```

---

# 28. Performance Requirements

Run load tests for expected launch volume.

Measure:

```text
API latency
search latency
checkout latency
webhook processing
queue latency
AI processing
driver assignment
real-time dashboard events
error rate
```

Optimize:

```text
indexes
query plans
caching
connection pools
queues
analytics aggregation
pagination
batching
```

---

# 29. Documentation Requirements

Keep documentation synchronized with implementation.

Update when required:

```text
API documentation
environment variables
database migrations
setup instructions
deployment instructions
operational procedures
permissions
business rules
```

Do not leave implementation behavior undocumented.

---

# 30. Progress Reporting

At the end of each phase provide a short internal completion report:

```text
PHASE:
STATUS:

IMPLEMENTED:
- ...

TESTED:
- ...

ISSUES FOUND:
- ...

FIXES:
- ...

REGRESSION:
- ...

REMAINING:
- ...

VERDICT:
COMPLETE / NOT COMPLETE
```

If the verdict is `NOT COMPLETE`, continue working on that phase.

Do not move forward merely to maintain momentum.

---

# 31. No Placeholder Rule

The following do not count as implementation:

```text
TODO comments
fake APIs
hardcoded fake analytics
mock finance calculations
buttons without backend behavior
screens disconnected from APIs
fake AI responses
fake WhatsApp behavior
fake LiveKit state
unverified status transitions
```

Mocks may be used temporarily during development, but they must be removed or isolated before the corresponding phase is marked complete.

---

# 32. Existing Code Protection

If the project already contains working code:

- analyze before editing
- preserve working behavior
- do not rewrite unnecessarily
- refactor only when justified
- update imports when moving files
- avoid duplicate modules
- avoid competing implementations of the same business logic

---

# 33. Production Readiness Gate

Do not declare the project ready until:

```text
frontend build passes
backend build passes
TypeScript passes
lint passes
database migrations pass
fresh install passes
tests pass
E2E passes
security audit passes
WhatsApp works
AI works
search works
orders work
merchant flow works
dispatch works
private chat works
calling works
support works
finance works
analytics work
management AI works
backups work
monitoring works
production smoke test passes
```

---

# 34. Final Completion Test

The final production flow must work:

```text
CUSTOMER SENDS A NATURAL WHATSAPP REQUEST
        ↓
AI UNDERSTANDS
        ↓
SYSTEM SEARCHES REAL MERCHANT PRODUCTS
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
PRIVATE CHAT WORKS
        ↓
PRIVATE CALL WORKS WHEN REQUESTED
        ↓
ORDER IS DELIVERED
        ↓
PAYMENT / CASH IS RECORDED
        ↓
CUSTOMER FEEDBACK IS STORED
        ↓
MERCHANT / DRIVER BALANCES UPDATE
        ↓
ANALYTICS UPDATE
        ↓
MANAGEMENT DASHBOARD UPDATES
        ↓
MANAGEMENT AI CAN ANALYZE THE RESULT
```

---

# 35. Final Instruction

Start by reading and auditing the complete project documentation and repository.

Then execute the master implementation plan phase by phase.

For every phase:

```text
ANALYZE
→ BUILD
→ VERIFY
→ TEST
→ AUDIT
→ FIX
→ REGRESSION TEST
→ ACCEPT
→ CONTINUE
```

Do not stop after planning.

Do not stop after scaffolding.

Do not stop because the happy path works.

Do not declare completion while any required phase remains incomplete.

Continue until all phases are implemented, integrated, audited, fixed, tested, and the platform satisfies the final production-readiness gate.

The final goal is:

# A COMPLETE, SECURE, TESTED, PRODUCTION-READY LION DELIVERY PLATFORM.
