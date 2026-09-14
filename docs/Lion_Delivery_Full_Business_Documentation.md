# Lion Delivery
## Full Business Documentation
### WhatsApp-First AI-Assisted Delivery Operations Platform

---

## 1. Document Purpose

This document defines the complete business scope, operating model, workflows, user journeys, business rules, dashboard requirements, analytics, communication flows, financial processes, and management controls for the proposed Lion Delivery platform.

The platform is designed around a simple principle:

> **Customers order through WhatsApp, while Lion Delivery manages the full operation from one centralized business dashboard.**

The customer does not need a dedicated mobile application.

The system is intended to simplify ordering, reduce manual coordination, improve delivery visibility, protect customer and driver privacy, and give Lion Delivery better control over merchants, drivers, customers, support, finance, and business performance.

---

# 2. Business Vision

Lion Delivery will operate as a WhatsApp-first delivery business where customers can:

- Ask for products without knowing which restaurant or supermarket has them.
- Order through text, Arabic, English, Lebanese Arabizi, images, voice notes, or video.
- Receive relevant merchant and product suggestions.
- Save delivery addresses and delivery instructions.
- Confirm orders directly in WhatsApp.
- Track orders.
- Communicate privately with the assigned driver.
- Contact support.
- Rate completed orders.

The Lion Delivery team will manage the operation through a centralized dashboard covering:

- Orders
- Customers
- Merchants
- Drivers
- Dispatch
- Conversations
- Support
- Finance
- Settlements
- Promotions
- Analytics
- Reports
- Management insights

---

# 3. Core Business Objectives

1. Make ordering easier for customers.
2. Remove the need for a customer mobile application.
3. Allow customers to search across multiple merchants from one conversation.
4. Reduce manual order-taking work.
5. Improve merchant and driver coordination.
6. Protect customer and driver privacy.
7. Centralize delivery operations.
8. Improve order tracking and issue resolution.
9. Reduce missed, delayed, or incorrectly assigned deliveries.
10. Create clear financial and settlement records.
11. Improve visibility into business performance.
12. Use AI to assist customers and management without allowing AI to control business-critical facts such as prices, totals, availability, or settlements.

---

# 4. Business Participants

## 4.1 Customer

The customer uses WhatsApp to:

- Search for products.
- Compare available options.
- Build an order.
- Save addresses.
- Confirm orders.
- Track orders.
- Communicate with the driver.
- Contact support.
- Rate the experience.
- Reorder previous purchases.

## 4.2 Merchant

A merchant may be:

- Restaurant
- Supermarket
- Bakery
- Convenience store
- Pharmacy where legally permitted
- Specialty shop
- Other approved seller

The merchant can:

- Receive orders.
- Accept or reject orders.
- Update preparation status.
- Mark orders ready.
- Report unavailable products.
- Pause or resume availability.
- Manage products, prices, and availability through Lion Delivery's approved business process.

## 4.3 Driver

The driver has a deliberately simple workflow.

The driver can:

- Receive a delivery offer.
- View pickup and delivery information.
- Accept or reject.
- Mark the order as picked up.
- Mark the order as delivered.
- Chat privately with the customer.
- Call the customer privately.
- Report an issue.

## 4.4 Lion Delivery Operations Team

The operations team manages:

- Live orders.
- Merchant responses.
- Driver assignment.
- Delays.
- Exceptions.
- Customer issues.
- Manual intervention.
- Order reassignment.

## 4.5 Customer Support

Customer support can:

- View customer conversations.
- Take over from automated assistance.
- Review order history.
- Review delivery communication.
- Handle complaints.
- Handle cancellations.
- Handle refunds or compensation requests.
- Escalate issues.

## 4.6 Finance

Finance manages:

- Order values.
- Delivery fees.
- Company commissions.
- Merchant balances.
- Driver balances.
- Cash reconciliation.
- Refunds.
- Adjustments.
- Settlements.
- Financial reporting.

## 4.7 Management

Management uses the dashboard to:

- Review business performance.
- Analyze orders.
- Review merchant performance.
- Review driver performance.
- Monitor support issues.
- Monitor customer behavior.
- Review finance.
- Use the management AI assistant to ask business questions.

---

# 5. Complete End-to-End Business Workflow

```text
MERCHANTS ONBOARDED
        ↓
PRODUCTS / MENUS ADDED
        ↓
CUSTOMER CONTACTS LION DELIVERY ON WHATSAPP
        ↓
CUSTOMER REQUEST IS UNDERSTOOD
        ↓
PRODUCTS SEARCHED ACROSS ELIGIBLE MERCHANTS
        ↓
BEST AVAILABLE OPTIONS IDENTIFIED
        ↓
CUSTOMER RECEIVES RECOMMENDATIONS
        ↓
CUSTOMER SELECTS PRODUCTS
        ↓
CART CREATED
        ↓
DELIVERY ADDRESS SELECTED OR CREATED
        ↓
FINAL TOTAL SHOWN
        ↓
CUSTOMER CONFIRMS ORDER
        ↓
MERCHANT RECEIVES ORDER
        ↓
MERCHANT ACCEPTS OR REJECTS
        ↓
IF ACCEPTED → DRIVER ASSIGNMENT
        ↓
DRIVER ACCEPTS
        ↓
MERCHANT PREPARES ORDER
        ↓
DRIVER PICKS UP
        ↓
CUSTOMER AND DRIVER PRIVATE COMMUNICATION ENABLED
        ↓
ORDER DELIVERED
        ↓
PAYMENT / CASH CONFIRMED
        ↓
ORDER COMPLETED
        ↓
CUSTOMER FEEDBACK
        ↓
MERCHANT / DRIVER / COMPANY BALANCES UPDATED
        ↓
ANALYTICS AND REPORTING UPDATED
```

---

# 6. Customer Experience

## 6.1 Supported Customer Communication

The customer can communicate naturally using:

- Arabic
- Lebanese Arabic
- English
- Lebanese Arabizi
- Mixed Arabic and English
- Text
- Voice notes
- Images
- Screenshots
- Shopping-list photos
- Handwritten shopping lists
- Product photos
- Video
- Shared map location

The customer should not be required to learn special commands.

---

# 7. Customer Product Search

The customer can search without knowing the merchant.

The customer may search by:

- Product
- Meal
- Brand
- Category
- Price range
- Budget
- Size
- Quantity
- Dietary requirement
- Product photo
- Shopping list
- Video
- Voice description

The platform searches eligible merchants and returns the most relevant options.

---

# 8. Customer Search Preferences

The customer may request:

- Cheapest option
- Fastest option
- Closest option
- Best-rated option
- Best value
- Lowest delivery fee
- Specific merchant
- Specific brand
- Specific size
- Specific budget
- Specific meal type
- Promotion
- Alternative product

---

# 9. Product Recommendation Rules

Recommendations may consider:

- Product relevance
- Merchant availability
- Merchant operating status
- Price
- Delivery fee
- Estimated delivery time
- Merchant rating
- Customer delivery area
- Promotions
- Customer preferences
- Previous orders
- Full basket price
- Product availability

The customer should normally receive a short list of the best options rather than every possible result.

---

# 10. Basket Comparison

For a multi-item grocery request, the platform should compare the total basket, including:

- Product prices
- Delivery fee
- Promotions
- Availability
- Complete basket total

The cheapest individual products do not necessarily represent the cheapest complete order.

---

# 11. Product Alternatives

If an exact item is unavailable, the customer may be offered:

- Same product from another merchant
- Same product in another size
- Similar brand
- Cheaper alternative
- Premium alternative
- Similar product

No substitution should be added without customer approval.

---

# 12. Cart Management

The customer can:

- Add item
- Remove item
- Increase quantity
- Decrease quantity
- Change size
- Change variant
- Add extras
- Remove ingredients
- Add notes
- Replace unavailable item
- Continue shopping
- Review cart
- Clear cart
- Confirm cart

---

# 13. Customer Address Management

Customers can save multiple delivery addresses such as Home, Work, Parents, Office, Friend, or Other.

Each address can include:

- Address title
- Written address
- Map location
- Building entrance photo
- Voice directions
- Written delivery notes
- Landmark
- Floor
- Apartment
- Contact person if needed
- Contact number if needed
- Default address

---

# 14. New Address Workflow

```text
CUSTOMER CHOOSES ADD ADDRESS
        ↓
CHOOSES ADDRESS NAME
        ↓
SHARES MAP LOCATION
        ↓
ADDS WRITTEN ADDRESS
        ↓
OPTIONAL BUILDING PHOTO
        ↓
OPTIONAL VOICE DIRECTIONS
        ↓
OPTIONAL LANDMARK / FLOOR / APARTMENT
        ↓
REVIEWS ADDRESS
        ↓
CONFIRMS
        ↓
ADDRESS SAVED
```

---

# 15. Order Confirmation Workflow

Before final confirmation, the customer should see:

- Merchant
- Products
- Quantities
- Product options
- Item prices
- Discounts
- Delivery fee
- Other applicable charges
- Final total
- Delivery address
- Estimated delivery time

The order is created only after customer confirmation.

---

# 16. Repeat Orders and Favorites

Customers may:

- Reorder the previous order.
- Repeat a restaurant order.
- Repeat a supermarket basket.
- Reuse favorite products.
- Reuse favorite merchants.
- Reuse favorite addresses.

The previous order should be rebuilt and shown for confirmation before submission.

---

# 17. Order Tracking

Typical statuses:

```text
ORDER CONFIRMED
        ↓
MERCHANT ACCEPTED
        ↓
PREPARING
        ↓
DRIVER ASSIGNED
        ↓
PICKED UP
        ↓
ON THE WAY
        ↓
DELIVERED
```

Important updates can also be sent automatically.

---

# 18. Order Cancellation

Cancellation rules may vary by stage:

- Before merchant acceptance
- After merchant acceptance
- During preparation
- After driver assignment
- After pickup

Lion Delivery may define:

- Free cancellation stage
- Approval-required stage
- Non-cancellable stage
- Applicable cancellation charges

---

# 19. Merchant Onboarding

Merchant information may include:

- Business name
- Business type
- Branches
- Contact information
- Locations
- Operating hours
- Delivery coverage
- Products / menus
- Categories
- Product options
- Prices
- Promotions
- Availability
- Preparation times
- Commission arrangement
- Settlement information

---

# 20. Merchant Product Management

Each product may include:

- Arabic name
- English name
- Common alternative names
- Description
- Image
- Category
- Brand
- Size
- Variant
- Price
- Discount
- Availability
- Add-ons
- Extras
- Removable ingredients
- Preparation notes

---

# 21. Merchant Order Workflow

```text
NEW ORDER
    ↓
MERCHANT REVIEWS
    ↓
ACCEPT / REJECT
    ↓
IF ACCEPTED
    ↓
PREPARING
    ↓
READY
    ↓
DRIVER PICKUP
    ↓
COMPLETED
```

Merchant actions:

- Accept order
- Reject order
- Set preparation time
- Mark preparing
- Mark ready
- Report unavailable item
- Report issue
- Pause orders
- Resume orders

---

# 22. Merchant Rejection Workflow

```text
MERCHANT REJECTS
      ↓
REJECTION REASON SAVED
      ↓
ALTERNATIVES SEARCHED
      ↓
CUSTOMER RECEIVES ALTERNATIVE
      ↓
CUSTOMER APPROVES
      ↓
NEW MERCHANT RECEIVES ORDER
```

Possible reasons:

- Product unavailable
- Too busy
- Closing
- Cannot fulfill complete order
- Price issue
- Other

---

# 23. Driver Workflow

```text
DELIVERY OFFER
      ↓
VIEW DELIVERY DETAILS
      ↓
ACCEPT / REJECT
      ↓
IF ACCEPTED
      ↓
GO TO MERCHANT
      ↓
PICKED UP
      ↓
GO TO CUSTOMER
      ↓
DELIVERED
```

Driver actions:

- Accept
- Reject
- Picked Up
- Delivered
- Chat with customer
- Call customer
- Report issue

---

# 24. Driver Delivery Information

The driver should see only what is necessary to complete the delivery:

- Order reference
- Pickup merchant
- Pickup location
- Delivery location
- Written delivery directions
- Building photo
- Voice directions
- Delivery notes
- Amount to collect
- Payment type
- Navigation option
- Customer contact option through Lion Delivery

The driver should not see the customer's personal phone number.

---

# 25. Customer and Driver Privacy

The customer should not see:

- Driver personal number
- Driver private WhatsApp details

The driver should not see:

- Customer personal phone number
- Customer private WhatsApp details

Communication is handled through Lion Delivery.

---

# 26. Private Customer ↔ Driver Chat

```text
CUSTOMER
    ↓
LION DELIVERY COMMUNICATION CHANNEL
    ↓
DRIVER
```

Supported communication may include:

- Text
- Voice notes
- Images
- Delivery-related messages

The communication is linked to the order.

---

# 27. Private Customer ↔ Driver Calling

The customer and driver may call each other through Lion Delivery without exposing personal phone numbers.

Customer action:

- Call Driver

Driver action:

- Call Customer

The communication channel is available only while needed for the active delivery.

---

# 28. Communication Expiry

```text
ORDER DELIVERED
      ↓
COMMUNICATION REMAINS AVAILABLE FOR A LIMITED PERIOD
      ↓
PRIVATE DELIVERY CHANNEL CLOSES
```

---

# 29. Communication Records

Subject to Lion Delivery policy and applicable legal requirements, the dashboard may maintain:

- Text messages
- Images
- Voice notes
- Message timestamps
- Call history
- Call duration
- Call recording where permitted
- Voice recording
- Transcription
- Support involvement

---

# 30. Driver Assignment Workflow

```text
MERCHANT ACCEPTS
      ↓
DELIVERY JOB CREATED
      ↓
ELIGIBLE DRIVERS IDENTIFIED
      ↓
BEST DRIVER SELECTED
      ↓
DELIVERY OFFER SENT
      ↓
DRIVER ACCEPTS?
      ├── YES → ASSIGN
      └── NO → NEXT DRIVER
```

Driver selection may consider:

- Availability
- Delivery area
- Distance
- Current workload
- Driver performance
- Active deliveries

---

# 31. Failed Driver Assignment

```text
DRIVER 1 REJECTS / TIMES OUT
      ↓
DRIVER 2
      ↓
DRIVER 3
      ↓
NO DRIVER AVAILABLE
      ↓
OPERATIONS ALERT
      ↓
MANUAL ACTION
```

---

# 32. Customer Support

Support cases may include:

- Late order
- Missing item
- Wrong item
- Damaged item
- Merchant problem
- Driver problem
- Cancellation
- Refund request
- Payment issue
- Address issue
- General complaint

---

# 33. Support Workflow

```text
CUSTOMER ISSUE
      ↓
ISSUE IDENTIFIED
      ↓
CAN IT BE RESOLVED AUTOMATICALLY?
      ├── YES → RESOLVE
      └── NO
            ↓
      HUMAN SUPPORT
            ↓
      RESOLUTION
            ↓
      CASE CLOSED
```

Support agents can:

- View conversation
- Take over conversation
- Send messages
- View order
- View merchant
- View driver
- Review delivery communication
- Add internal notes
- Escalate
- Handle approved compensation
- Handle refund workflow
- Close case

---

# 34. Dashboard Structure

```text
Overview
Live Operations
Orders
WhatsApp Conversations
Customers
Addresses
Merchants
Branches
Products
Catalog
Drivers
Dispatch
Delivery Areas
Customer Support
Complaints
Promotions
Finance
Settlements
Analytics
Reports
Management AI Assistant
Notifications
Users
Roles & Permissions
Settings
Audit History
```

---

# 35. Dashboard Overview

Management should be able to see:

- Orders today
- Orders this week
- Orders this month
- Active orders
- Completed orders
- Cancelled orders
- Failed orders
- Waiting for merchant
- Preparing
- Waiting for driver
- On the way
- Gross order value
- Delivery revenue
- Commission revenue
- Average order value
- Average delivery time
- Available drivers
- Active merchants
- Customer conversations
- New customers
- Returning customers
- Current operational issues
- Important alerts

---

# 36. Live Operations

```text
NEW
 ↓
WAITING FOR MERCHANT
 ↓
ACCEPTED
 ↓
PREPARING
 ↓
READY
 ↓
WAITING FOR DRIVER
 ↓
DRIVER ASSIGNED
 ↓
PICKED UP
 ↓
ON THE WAY
 ↓
DELIVERED
```

Operations can:

- View order
- View current status
- View time in status
- View merchant
- View driver
- View delivery area
- Reassign driver
- Contact merchant
- Contact driver
- Contact customer
- Escalate issue
- Cancel when permitted
- Add internal notes

---

# 37. Order Management

Each order should maintain:

- Order reference
- Customer
- Address
- Merchant
- Products
- Quantities
- Options
- Prices
- Discounts
- Delivery fee
- Final total
- Payment type
- Driver
- Status
- Timeline
- Merchant response
- Delivery communication
- Complaints
- Refunds
- Final financial breakdown

---

# 38. Customer Management

Customer profile may include:

- WhatsApp identity
- Name where available
- Saved addresses
- Order history
- Total spend
- Average order
- Last order
- Favorite merchants
- Favorite products
- Most-used address
- Completed orders
- Cancelled orders
- Complaints
- Ratings
- Vouchers
- Promotions
- Internal notes
- Customer status

---

# 39. Merchant Management

Dashboard merchant management should include:

- Merchant profile
- Business type
- Branches
- Locations
- Operating hours
- Delivery areas
- Products
- Menus
- Prices
- Availability
- Promotions
- Orders
- Acceptance rate
- Rejection rate
- Preparation time
- Sales
- Ratings
- Complaints
- Commission
- Settlements
- Merchant status

---

# 40. Driver Management

Dashboard driver management should include:

- Driver profile
- Availability
- Current status
- Active delivery
- Delivery history
- Accepted deliveries
- Rejected deliveries
- Completed deliveries
- Average delivery time
- Cash collected
- Outstanding balance
- Driver payout
- Performance
- Complaints
- Rating

---

# 41. Promotions and Loyalty

Promotion types may include:

- Percentage discount
- Fixed discount
- Free delivery
- First-order promotion
- Merchant-specific promotion
- Product promotion
- Category promotion
- Area promotion
- Customer-specific voucher
- Re-engagement promotion
- Loyalty reward
- Minimum-spend offer

Possible loyalty features:

- Order-count rewards
- Spend-based rewards
- Free delivery rewards
- Discount vouchers
- Returning-customer rewards
- Referral rewards

---

# 42. Payment and Cash Management

Payment information should include:

- Order amount
- Amount due
- Amount collected
- Delivery fee
- Service fee
- Merchant share
- Company commission
- Driver amount
- Discount
- Refund
- Outstanding balance

---

# 43. Cash Collection Workflow

```text
ORDER DELIVERED
      ↓
DRIVER COLLECTS CASH
      ↓
CASH CONFIRMED
      ↓
DRIVER BALANCE UPDATED
      ↓
MERCHANT BALANCE UPDATED
      ↓
LION DELIVERY REVENUE UPDATED
```

---

# 44. Merchant Settlement

```text
COMPLETED SALES
-
LION DELIVERY COMMISSION
-
REFUNDS
-
APPROVED ADJUSTMENTS
=
AMOUNT PAYABLE TO MERCHANT
```

Dashboard should show:

- Current balance
- Pending settlement
- Paid settlements
- Adjustments
- Settlement history

---

# 45. Driver Settlement

For each driver:

- Deliveries completed
- Delivery earnings
- Cash collected
- Amount owed to Lion Delivery
- Amount owed to driver
- Adjustments
- Bonuses
- Deductions
- Settlement status

---

# 46. Refunds and Compensation

Supported actions may include:

- Full refund
- Partial refund
- Missing-item refund
- Wrong-item refund
- Delivery-fee refund
- Goodwill compensation
- Voucher compensation

Every refund or compensation should have:

- Order
- Reason
- Amount
- Approving employee
- Date
- Status

---

# 47. Financial Dashboard

Management should be able to review:

- Gross order value
- Company revenue
- Delivery revenue
- Commission revenue
- Merchant payouts
- Driver payouts
- Discounts
- Refunds
- Compensation
- Promotion cost
- AI operating cost
- WhatsApp communication cost
- Calling / communication cost
- Cost per order
- Revenue per order
- Gross profit
- Operating margin

---

# 48. Customer Analytics

- Total customers
- New customers
- Returning customers
- Active customers
- Customers by area
- Orders per customer
- Average customer spend
- Average basket
- Customer lifetime value
- Repeat order rate
- Retention
- Cancellation rate
- Favorite merchants
- Favorite categories
- Favorite products
- Most-used addresses

---

# 49. Order Analytics

- Orders per day
- Orders per hour
- Orders per week
- Orders per month
- Completed orders
- Failed orders
- Cancelled orders
- Average order value
- Average number of items
- Average delivery fee
- Average preparation time
- Average delivery time
- Orders by area
- Orders by merchant
- Orders by category
- Orders by product

---

# 50. Merchant Analytics

- Merchant sales
- Order count
- Revenue
- Average basket
- Acceptance rate
- Rejection rate
- Preparation time
- Cancelled orders
- Best-selling products
- Unavailable products
- Customer ratings
- Complaints
- Repeat customers

---

# 51. Driver Analytics

- Deliveries
- Acceptance rate
- Rejection rate
- Pickup time
- Delivery time
- Completed deliveries
- Failed deliveries
- Cash collected
- Driver earnings
- Ratings
- Complaints
- Delays
- Performance ranking

---

# 52. Product Analytics

- Most searched products
- Most ordered products
- Highest-revenue products
- Most unavailable products
- Searches with no results
- Products frequently substituted
- Popular brands
- Popular categories
- Demand by area
- Demand by time

A key report should identify products customers are searching for but Lion Delivery's merchants do not currently provide.

---

# 53. WhatsApp Analytics

- Conversations per day
- Conversations per month
- Customer messages
- Business messages
- Average messages per conversation
- Text usage
- Voice-note usage
- Image usage
- Video usage
- Average conversation length
- Conversation-to-order conversion
- Abandoned conversations
- WhatsApp cost
- Cost per conversation
- Cost per completed order

---

# 54. AI Analytics

- Requests successfully understood
- Clarifications required
- Product searches
- Successful searches
- Failed searches
- Recommendations shown
- Recommendations selected
- Search-to-cart conversion
- Cart-to-order conversion
- Human support handoffs
- Conversation abandonment
- AI operating cost
- AI cost per conversation
- AI cost per completed order

---

# 55. Customer-to-Order Funnel

```text
WHATSAPP CONVERSATIONS
        ↓
PRODUCT SEARCHES
        ↓
RECOMMENDATIONS
        ↓
PRODUCT SELECTIONS
        ↓
CARTS
        ↓
CONFIRMED ORDERS
        ↓
MERCHANT ACCEPTED
        ↓
DELIVERED ORDERS
```

---

# 56. Management AI Assistant

Management may ask questions such as:

- How many orders did we complete today?
- Compare this week with last week.
- Which merchant rejected the most orders?
- Which drivers are performing best?
- Which delivery areas generate the highest revenue?
- Why did cancellations increase?
- Which products are searched for but unavailable?
- How much did WhatsApp cost this month?
- Which merchants have the slowest preparation time?
- Which customers order most frequently?
- Give me today's business summary.

The assistant may provide:

- Answers
- Summaries
- Comparisons
- Trends
- Rankings
- Operational insights
- Financial insights
- Customer insights
- Merchant insights
- Driver insights

---

# 57. Reports

Reports may include:

- Daily operations report
- Weekly management report
- Monthly business report
- Sales report
- Revenue report
- Merchant report
- Driver report
- Customer report
- Order report
- Cancellation report
- Complaint report
- Delivery performance report
- Product-demand report
- Unavailable-product report
- Promotion report
- Refund report
- Settlement report
- Communication-cost report
- Profitability report

---

# 58. Alerts

Lion Delivery may receive alerts for:

- Merchant not responding
- Driver not responding
- No driver available
- Late order
- Long preparation time
- Customer complaint
- Refund request
- Failed delivery
- Merchant repeatedly rejecting
- Driver repeatedly rejecting
- Frequently unavailable products
- Sudden increase in cancellations
- Significant revenue change
- Outstanding settlements
- Cash reconciliation issue

---

# 59. Roles and Permissions

## Superadmin
Full platform access.

## Owner / General Manager
Business overview, analytics, operations, finance, and reports.

## Operations Manager
Orders, merchants, drivers, dispatch, and operational issues.

## Dispatcher
Active deliveries, driver assignment, and reassignment.

## Customer Support
Customers, conversations, complaints, and support cases.

## Finance
Revenue, settlements, adjustments, refunds, and financial reports.

## Merchant Manager
Merchant onboarding, products, pricing, availability, and merchant performance.

## Analyst
Analytics and reports.

Access should be based on employee responsibility.

---

# 60. Audit History

Important actions should maintain a business history, including:

- Order status change
- Driver reassignment
- Merchant change
- Product price change
- Refund
- Settlement
- Manual order edit
- Customer support action
- Promotion change
- User action

Management should be able to see:

- What changed
- Who changed it
- When it changed

---

# 61. Core Business Rules

1. AI may understand and assist, but business data remains authoritative.
2. Prices must come from approved merchant data.
3. Availability must reflect the current merchant status.
4. Orders are created only after customer confirmation.
5. Product substitutions require customer approval.
6. Driver assignment must prevent duplicate ownership of the same delivery.
7. Customer and driver personal numbers remain private.
8. Private customer-driver communication is limited to the active delivery.
9. Refunds and financial adjustments require authorized actions.
10. Important operational actions must be auditable.
11. Human support must be available when automation cannot safely resolve an issue.
12. Management analytics must reflect actual recorded business data.

---

# 62. Customer Journey Summary

```text
CUSTOMER OPENS WHATSAPP
        ↓
SENDS TEXT / VOICE / IMAGE / VIDEO
        ↓
REQUEST UNDERSTOOD
        ↓
PRODUCTS SEARCHED
        ↓
OPTIONS PRESENTED
        ↓
CUSTOMER SELECTS
        ↓
CART CREATED
        ↓
ADDRESS SELECTED
        ↓
FINAL TOTAL SHOWN
        ↓
CUSTOMER CONFIRMS
        ↓
MERCHANT ACCEPTS
        ↓
DRIVER ACCEPTS
        ↓
ORDER PREPARED
        ↓
DRIVER PICKS UP
        ↓
PRIVATE CUSTOMER-DRIVER COMMUNICATION
        ↓
DELIVERY
        ↓
PAYMENT CONFIRMED
        ↓
CUSTOMER RATES EXPERIENCE
        ↓
ORDER COMPLETED
```

---

# 63. Merchant Journey Summary

```text
MERCHANT ONBOARDED
       ↓
PRODUCTS / MENU ADDED
       ↓
MERCHANT GOES LIVE
       ↓
CUSTOMERS DISCOVER PRODUCTS
       ↓
MERCHANT RECEIVES ORDER
       ↓
ACCEPT / REJECT
       ↓
PREPARE
       ↓
READY
       ↓
DRIVER PICKS UP
       ↓
ORDER DELIVERED
       ↓
SALE RECORDED
       ↓
MERCHANT BALANCE UPDATED
       ↓
SETTLEMENT
```

---

# 64. Driver Journey Summary

```text
DRIVER AVAILABLE
      ↓
DELIVERY OFFER
      ↓
VIEW DELIVERY DETAILS
      ↓
ACCEPT / REJECT
      ↓
GO TO MERCHANT
      ↓
PICKED UP
      ↓
PRIVATE CUSTOMER CHAT / CALL AVAILABLE
      ↓
GO TO CUSTOMER
      ↓
DELIVER
      ↓
CONFIRM DELIVERY
      ↓
CASH RECORDED IF APPLICABLE
      ↓
JOB COMPLETED
```

---

# 65. Internal Lion Delivery Journey

```text
CUSTOMER DEMAND
       ↓
ORDER
       ↓
MERCHANT
       ↓
DISPATCH
       ↓
DRIVER
       ↓
DELIVERY
       ↓
PAYMENT
       ↓
SETTLEMENT
       ↓
SUPPORT
       ↓
FEEDBACK
       ↓
ANALYTICS
       ↓
MANAGEMENT INSIGHTS
       ↓
BUSINESS DECISIONS
```

---

# 66. Suggested Rollout

## Phase 1 — Core Operations

- Customer WhatsApp ordering
- AI-assisted product search
- Merchant search
- Cart
- Customer addresses
- Order confirmation
- Merchant accept / reject
- Driver accept / reject
- Picked Up / Delivered
- Core dashboard
- Orders
- Customers
- Merchants
- Drivers
- Basic dispatch
- Basic support
- Basic analytics

## Phase 2 — Communication and Control

- Private customer-driver chat
- Private customer-driver calling
- Call history
- Recording where approved
- Voice communication records
- Live operations improvements
- Support takeover
- Delivery exceptions
- Additional operational alerts

## Phase 3 — Finance and Management

- Merchant settlements
- Driver settlements
- Cash reconciliation
- Refunds
- Promotions
- Loyalty
- Advanced analytics
- Advanced reports
- Management AI assistant
- Extended audit controls

---

# 67. Success Measures

The platform should ultimately be measured by improvements in:

- Customer ordering convenience
- Conversation-to-order conversion
- Order processing speed
- Merchant response time
- Driver acceptance time
- Delivery time
- Order completion rate
- Customer repeat rate
- Customer satisfaction
- Merchant acceptance rate
- Driver performance
- Support resolution time
- Delivery cost visibility
- Financial accuracy
- Management visibility

---

# 68. Final Business Outcome

The finished Lion Delivery platform should operate as a centralized delivery business where:

- Customers order naturally through WhatsApp.
- AI helps customers express what they want.
- Lion Delivery finds suitable products and merchants.
- Merchants receive and prepare orders.
- Drivers receive simple delivery jobs.
- Customer and driver privacy is protected.
- Support can intervene when required.
- Finance has clear balances and settlements.
- Management sees the full operation from one dashboard.
- Analytics convert day-to-day activity into business insight.

The result is a simpler customer experience and a more controlled, measurable, and scalable delivery operation for Lion Delivery.
