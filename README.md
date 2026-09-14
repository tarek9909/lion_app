# Lion Delivery

> **WhatsApp-First AI-Assisted Delivery Operations Platform**

Lion Delivery is an operations and delivery management platform built around a simple principle:
**Customers order through WhatsApp, while Lion Delivery manages the full operation from a centralized management dashboard.**

---

## 📁 Repository Structure

- `backend/`: Express + TypeScript + MySQL 8 + Redis backend implementing the WhatsApp conversational engine, catalog search, cart management, fulfillment lifecycle, masked relay, real-time WebSocket, analytics, and management AI.
- `dashboard/`: Vite + React 19 + TypeScript + Vanilla CSS executive dashboard featuring WhatsApp simulator, live orders Kanban, masked relay monitor, catalog browser, fleet monitor, analytics, and management AI copilot.
- `Lion_Delivery_Full_MySQL_Database.sql`: Complete MySQL database schema and relational design (**121 base tables and 5 views**).
- `docs/`: Comprehensive project documentation suite including business specs, technical architecture, and the authoritative 50-gap remediation plan (`docs/Lion_Delivery_Demo_Gaps_and_Fix_Plan.md`).

---

## 🚀 Quick Start & Demo Commands

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v24)
- **MySQL**: 8.0+ running on `localhost:3306` with database `lion_delivery` loaded
- **Redis**: 6.0+ running on `localhost:6379`

### 2. Install & Build
```bash
npm install
npm --prefix backend install
npm --prefix dashboard install
npm run build
```

### 3. Master Test Suite (10 Suites, 100% Passing)
```bash
npm test
```
*Executes all 10 test suites sequentially, including browser and DG-001–DG-008 regression coverage:*
1. **HTTP API & Auth**: Health checks, MySQL/Redis readiness, PBKDF2 authentication, JWT tokens, Zod request validation, and sanitized error responses.
2. **WhatsApp Webhooks & Media**: Meta Cloud API verification (`hub.challenge`), HMAC-SHA256 signature verification, webhook deduplication via `integration_webhook_events`, audio voice notes, and image vision ingestion.
3. **WebSockets & Live Events**: Verifies standard dual-payload envelope `{ type, payload, data, timestamp }` and real-time live event broadcasting.
4. **Failures & State Machine**: State transition validation (`CONFIRMED` -> `PREPARING` -> `DRIVER_ASSIGNED` -> `PICKED_UP` -> `DELIVERED`), idempotency key collision handling, and empty cart protection.
5. **AI 15-Scenario Test Pack**: 15 multi-turn scenarios covering Lebanese Arabizi, Arabic, voice notes, image understanding, supermarket comparison, quantity correction, and address resolution.
6. **Full Client Demo Rehearsal (3x)**: Complete 15-step golden flow executed 3 consecutive times with deterministic clean resets (<100ms each).
7. **Backup Demo Scenario**: Operational resilience testing peak-load kitchen rejection with instant AI alternative recommendation, driver re-route, and delivery.
8. **Configuration & Provider Matrix**: Startup fail-closed and local/live provider boundary checks.
9. **Gemini Integration**: Tool loop, confirmation guard, Redis memory, and provider error handling.
10. **Demo Gap Regression Suite**: Dual currency, address ambiguity, driver exhaustion, GPS fixtures, copilot routing, cart reminders, and image candidate disambiguation.

### 4. Individual Test Commands
```bash
npm run test:api            # Real HTTP API & Auth integration tests
npm run test:webhook        # Webhook signature, deduplication, & media tests
npm run test:ws             # WebSocket live envelope & broadcast tests
npm run test:failures       # State machine transitions & idempotency tests
npm run test:conversations  # 15 Conversational AI multi-turn test cases
npm run test:rehearsal      # 3x consecutive full demo rehearsals
npm run demo:backup         # Resilient backup re-route client demo scenario
npm run test:config-matrix  # Startup and provider boundary matrix
npm run test:gemini         # Gemini provider integration suite
npm run test:browser        # 3x browser dashboard E2E rehearsal
npm run test:demo-gaps      # DG-001–DG-008 regression suite
```

### 5. Launch Full Platform Locally
In Terminal 1 (Backend API & WebSocket on `localhost:4000`):
```bash
npm run dev:backend
```

In Terminal 2 (React Dashboard on `localhost:5173`):
```bash
npm run dev:dashboard
```
Open `http://localhost:5173` in your browser to present the live interactive demo!

### 6. Reset Demo State
```bash
npm run demo:reset
```
*Restores MySQL tables, Redis memory, active carts, and order queues to pristine baseline in under 100ms, asserting 10 post-reset invariants.*

---

## 🔑 Authentication & Operator Credentials
- **Role**: Superadmin Operator
- **Email**: `admin@liondelivery.com`
- **Password**: `admin123` (PBKDF2 hashed in database)
