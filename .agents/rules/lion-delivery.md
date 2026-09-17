---
description: "Authoritative Lion Delivery project operating rules for Antigravity coding agents"
always_on: true
---

# Lion Delivery Operating Rules

All agent operations in this repository are governed by the canonical project rules defined in:
👉 [AGENTS.md](../../AGENTS.md)

### Core Mandates for Agents:
1. **Core Principle**: WhatsApp-first ordering; centralized React dashboard for operations. No customer mobile application.
2. **Current vs Future Direction**: The immediate milestone is the client demo (conversational AI in Lebanese Arabizi/Arabic/English, catalog search, basket comparison, cart, saved addresses, order lifecycle, masked relay, live analytics, management AI). Future architecture evolves into a multi-tenant Delivery Office SaaS. Never hardcode assumptions that Lion Delivery is the sole platform tenant.
3. **AI Rule**: "AI interprets. The application decides." AI uses schema-validated tools (`AiToolsExecutor`) and is never authoritative for prices, availability, delivery fees, order totals, settlements, or permissions.
4. **Catalog Miss Rule**: When an item is not found, reply with exact text:
   `"I couldn't find that within my current catalog. Do you want to choose another item or try a different name?"`
5. **Sender-Language Rule**: Detect the language/script of the latest incoming customer message and reply in that language (Arabizi, Arabic script, English, French, mixed).
6. **No-Placeholder Rule**: No TODOs, fake totals, mock-only controllers, or hardcoded presentation cards count as complete.
7. **Testing & Verification**: After any code changes, verify with `npm run build` and run relevant backend test suites (`npm test` or `npm --prefix backend run test:<suite>`).
