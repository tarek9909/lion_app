# AI Continuous Learning: Gaps and Remediation Plan

## Audit result

The implementation establishes a database-backed foundation for customer memory, conversation harvesting, dataset curation, model registration, evaluation gating, shadow execution, and canary routing.

All persistence is verified strictly against an isolated disposable MySQL database and isolated Redis (DB 15), with zero in-memory persistence mocks.

**Honest Verification Status on Live Google AI Integration**:
- **Live Gemini Fine-Tuning**: Provider contract and HTTP payload inspection are verified. Live model fine-tuning job submission and polling against Google AI Studio remain **unverified / blocked** due to unconfigured `GEMINI_API_KEY`.
- **Live Candidate Evaluation**: The offline evaluation gate harness, safety/intent thresholds, and promotion blocks are verified. Candidate evaluation against `REAL_GEMINI` fails closed (`REJECTED`) when uncredentialed. The automated pipeline is verified using a deterministic mock harness that explicitly records `isRealCandidateEvaluated: false` in MySQL. Live candidate model evaluation against Google AI remains **unverified / blocked**.
- **Shadow/Canary Endpoints**: Endpoint routing, candidate execution, zero mutations, and 1-click rollback are verified. Invocations of an actual Google-hosted tuned model endpoint remain **unverified / blocked** pending live model training.

## What currently works

- Gemini calls `CustomerMemoryService.observeAndLearn` for live customer messages and adds retrieved memory to the Gemini system prompt.
- The service extracts dietary exclusions and delivery instructions from English, Arabic, and Lebanese Arabizi.
- Staged conversations are scrubbed of PII before MySQL insertion (`training_curation_queue` contains only sanitized text; legacy raw columns are dropped).
- Non-consenting customers are strictly excluded from harvesting. Right-to-be-forgotten purges memory, consent, and queue rows.
- Customer memory persists to MySQL `customer_preferences` and survives Redis cache flushes and fresh process restarts.
- Structured memory lifecycle tracks items through `UNCONFIRMED_SUGGESTION`, `CUSTOMER_CONFIRMED`, `CORRECTED`, and `EXPIRED`.
- Watermark harvester idempotently ingests eligible turns and tracks checkpoints in MySQL `training_harvest_checkpoints`.
- Multi-turn correlation matches inbound customer messages with exact AI responses via `inbound_message_id`, quarantining unmatched turns.
- Supervised JSONL dataset builder validates dialogue turns against Gemini fine-tuning schemas.
- Provider contract tests inspect outgoing tuning requests, verifying payload structure and dataset examples.
- Model registry blocks `REGISTERED` and `REJECTED` models from shadow or canary promotion.
- Shadow execution verifies zero mutations (0 carts, 0 orders, 0 addresses, 0 customer messages) with candidate telemetry logged.
- Emergency 1-click rollback immediately resets router to `STABLE_ONLY` and records rollback reasons in MySQL.
- Full E2E verification suite (`test-ai-continuous-learning-e2e.ts`) runs against an isolated disposable database and drops it on completion.

## Gaps and Remediation Status

| Priority | Gap | Status | Current evidence | Closure work | Acceptance check |
| --- | --- | --- | --- | --- | --- |
| P0 | Raw PII is retained in the curation queue. | **CLOSED** | Verified against isolated disposable MySQL database: `INFORMATION_SCHEMA.COLUMNS` confirms legacy columns `raw_user_message` and `model_response` are dropped. Stored rows and export APIs contain only redacted text. | Stored only redacted content. Migration `purge-raw-pii.ts` executed. Review and export APIs return strictly redacted content. Tested against real MySQL. | Acceptance Check 1 passed with real MySQL queries proving raw columns are absent and queue rows are redacted. |
| P0 | No consent or retention policy is enforced. | **CLOSED** | Verified against MySQL: Non-consenting customers (`ai_training_consent = 0`) strictly excluded from harvesting. Right-to-be-forgotten purges memory, consent, and queue rows, logging audit event in `ai_audit_events`. Retention purges aged records. | Implemented consent checks in `TrainingHarvestService`, full erasure in `CustomerMemoryService.optOutAndEraseMemory`, and queue retention cleanup. | Acceptance Check 2 passed against isolated MySQL and Redis DB 15 with audit log verification. |
| P0 | The export is not a faithful supervised conversation dataset. | **CLOSED** | Verified: `DatasetTurnRecord` and `exportGeminiFineTuningJsonl` generate schema-compliant JSONL pairing sanitized user turns with validated model responses. | Implemented `DatasetBuilderService` with schema validation and exact dialogue pairing. | Acceptance Check 3 passed via schema validator and JSONL structure inspection. |
| P1 | Harvesting is manual only. | **CLOSED** | Verified against MySQL: Watermark checkpoints persisted in `training_harvest_checkpoints`. Harvester advances idempotently and resumes correctly from saved watermarks. | Implemented durable watermark tracking in MySQL with scheduled and programmatic execution. | Acceptance Check 4 passed with real database checkpoint progression queries. |
| P1 | Conversation-to-response matching is too loose. | **CLOSED** | Verified against MySQL: Unmatched turns quarantined with reason logged in `training_harvest_checkpoints`. Loose `OR ai.conversation_id = c.id` join fallback removed; exact `inbound_message_id` required. | Eliminated loose join fallbacks; quarantine unmatched customer turns. | Acceptance Check 5 passed with multi-turn message correlation test proving zero cross-turn leakage. |
| P1 | Some claimed customer memory is not durable. | **CLOSED** | Verified: Preferences and memories persisted to MySQL `customer_preferences`. Fresh child process restart without Redis cache successfully reloaded preferences directly from MySQL. | Replaced Redis-only fallback with MySQL-backed `CustomerMemoryService` and child process verification. | Acceptance Check 6 passed across Redis flush and fresh process restart. |
| P1 | Memory is learned from a single unconfirmed message. | **CLOSED** | Verified: Memories stored as structured `CustomerMemoryItem` with lifecycle status (`SUGGESTED` -> `CUSTOMER_CONFIRMED`). Confirmed, corrected, expired, and deleted items correctly reflected in MySQL. | Added memory lifecycle management with explicit confirmation, correction, TTL expiry, and replacement options. | Acceptance Check 7 passed with database verification for suggestions, confirmation, correction, expiry, and deletion. |
| P1 | No actual Gemini fine-tuning or deployment lifecycle exists. | **PARTIAL / BLOCKED ON LIVE CREDENTIALS** | Provider contract verified: Outgoing HTTP payload inspected (7 examples validated against Gemini JSON schema) and tracked in MySQL `ai_training_jobs`. Live model training job submission and polling against Google AI Studio are **NOT verified** because `GEMINI_API_KEY` is not configured. | Implemented `GeminiTuningProvider`, `ai_training_jobs` table, and provider contract inspection tests. Live execution ready pending valid Google AI credentials. | Acceptance Check 8 passed with provider contract inspection and MySQL job tracking. Explicitly reports live training unverified. |
| P1 | Shadow/canary is not connected to learned models. | **PARTIAL / BLOCKED ON LIVE CREDENTIALS** | Gate logic verified: `ModelRegistryService` strictly blocks `REGISTERED` and `REJECTED` models. `REAL_GEMINI` evaluation fails closed when uncredentialed. Pipeline verified with `DETERMINISTIC_MOCK`, which explicitly tags `isRealCandidateEvaluated: false` in MySQL. Candidate endpoint routed to router. Instant rollback verified in MySQL. Live candidate evaluation and live tuned endpoint execution against Google AI are **NOT verified** pending credentials. | Implemented model registry gates, fail-closed offline evaluation gate, deterministic mock harness, and dynamic router endpoint resolution. | Acceptance Check 9 passed with fail-closed gate verification, deterministic pipeline check, and candidate endpoint routing. |
| P1 | Tests do not prove the end-to-end production path. | **CLOSED** | Verified: `test-ai-continuous-learning-e2e.ts` creates and drops an isolated disposable MySQL database and isolates Redis to DB 15. Zero in-memory persistence mocks. Preflight connectivity checks enforce real MySQL and Redis. Snapshot assertions proved zero mutations (0 carts, 0 orders, 0 addresses) in shadow mode. | Rewrote test suite with strict database assertions, disposable database lifecycle, preflight connectivity checks, and zero in-memory persistence mocks. | Acceptance Check 10 passed; all 10 acceptance checks verified end-to-end against real disposable MySQL and Redis DB 15. |

## Architectural Note: Gemini-Only Production vs Non-Production Test Fallbacks

The repository codebase implements a strict environment boundary for AI providers:

1. **Production Runtime (`NODE_ENV === 'production'`)**:
   - In `backend/src/config/env.ts`, `validateStartupConfig` strictly mandates Gemini:
     ```ts
     if (targetConfig.nodeEnv === 'production' && (stableProvider !== 'gemini' || candidateProvider !== 'gemini')) {
       throw new Error('Startup Error: production AI routing is Gemini-only. Set AI_STABLE_PROVIDER=gemini and AI_CANDIDATE_PROVIDER=gemini.');
     }
     ```
   - Production startup will immediately crash if any provider other than `gemini` is configured.
   - Production customer-facing traffic is 100% Gemini-only.

2. **Non-Production Environments (Development, CI, Local Test Fixtures)**:
   - The codebase maintains `smart_nlu` as a deterministic local fallback / test fixture provider.
   - This allows developers and automated test suites (such as the 15-suite master runner `test-all.ts` and config matrix tests) to execute without requiring paid Google API keys, internet connectivity, or exposing secrets.
   - Therefore, while the production environment is strictly Gemini-only, the codebase maintains deterministic local fallbacks for non-production development and offline testability.

## Operational guardrails

- Human approval remains mandatory before any customer conversation enters a training dataset.
- Keep raw production conversations out of training tables and exported artifacts.
- Never let a trained candidate mutate carts, addresses, or orders while in shadow evaluation.
- Preserve a fixed, tested fallback model and a one-action rollback path.
- Version every dataset, evaluation result, model, rollout decision, and deletion event.

## Definition of complete

The continuous-learning capability is complete only when it can safely harvest eligible consented conversations automatically, redact and retain them according to policy, pair turns correctly, undergo human review, create a valid versioned dataset, train and evaluate a candidate model, and promote it through reversible shadow/canary controls with measurable safety and business gates.
