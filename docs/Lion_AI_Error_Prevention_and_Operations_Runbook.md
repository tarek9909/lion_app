# Lion AI Error Prevention and Operations Runbook

Status: implementation and operations runbook. Runtime safeguards described here were deployed to the configured demo server at commit `000feec`; live Meta/Gemini conversation verification remains an operator-controlled gate.

Date: 2026-09-16

## 1. What the supplied log proves

The supplied PM2 excerpt proves only that:

- MySQL connected successfully.
- Redis connected successfully.
- The WhatsApp worker started with a 750 ms poll interval and three retries.
- The AI routing configuration was reconciled as `STABLE_ONLY` with zero canary traffic.
- WhatsApp is in `LIVE` mode.
- Meta accepted several outbound messages and returned a WhatsApp provider message ID for each.

It does not prove that:

- every inbound webhook was received and deduplicated;
- the correct conversation state was loaded;
- Gemini selected the correct intent or tool;
- the reply used the customer's language and script;
- an address, product, cart, or order error received its own response category;
- a reply was sent exactly once;
- the running PM2 process is using the current `dist` build and the intended working directory;
- the displayed outbound messages correspond to the expected inbound turns.

The provider IDs shown are different, so this excerpt is not proof of duplicate provider sends. It is also not proof that the messages were correct. Every turn must be traceable from inbound provider event to AI decision, tool result, outbox row, and final provider status.

No system can promise zero failures. The production objective is stronger and measurable: prevent unsafe actions, preserve business truth, fail closed when uncertain, make every failure diagnosable, retry only safe transient failures, and recover without duplicate orders or silent data loss.

## 2. Documentation set and source of truth

Use these documents together; do not treat a green checkbox as runtime evidence by itself.

| Document | Purpose | Owner |
|---|---|---|
| `docs/Lion_Customer_Conversation_Gap_and_Gemini_Training_Plan.md` | Customer behavior contract and seven acceptance scenarios | Product + AI |
| `docs/AI_Flow_Hardening_Audit.md` | Current webhook, worker, retry, and idempotency boundaries | Backend |
| `docs/Lion_WhatsApp_Server_Deployment_Checklist.md` | Server, Meta webhook, and demo deployment verification | Operations |
| `docs/Lion_Premium_AI_Self_Learning_Architecture.md` | Redacted learning, curation, evaluation, and model promotion | AI governance |
| `docs/Gemini_WhatsApp_Integration_Kickoff.md` | Gemini/WhatsApp setup and integration contract | Backend + Operations |
| `docs/Lion_AI_Error_Prevention_and_Operations_Runbook.md` | This file: prevention, monitoring, incident response, and release gates | Service owner |

The customer-conversation plan is the behavior source of truth. If another prompt, template, test, dashboard label, or deployment note conflicts with it, the conflicting artifact must be corrected before release.

The customer-conversation plan now records implementation status in the working tree. Its completed checkboxes represent code and local-test evidence; live production sign-off remains a separate release gate.

## 2A. Current implementation and evidence ledger

The following safeguards are implemented and verified locally against disposable MySQL/Redis fixtures:

| Safeguard | Implementation evidence | Verification |
|---|---|---|
| Durable context after Redis expiry | Gemini rebuilds bounded history from persisted `messages`; state keeps a rolling summary; context compiler injects durable turns, summary, task, and verified facts. | `test:ai-learning-e2e`, `test:ai-architecture`, `test:all` |
| Conversation/session isolation | Inbound persistence closes an OPEN conversation after 24 hours of inactivity and creates a new task boundary. | Build + conversation suites |
| Exactly-once reply enqueue | `outbox_events.dedupe_key` is unique and reply insertion treats a concurrent duplicate as the canonical existing row. | `test:webhook`, `test:all`; run migration before release |
| State payload safety | State snapshots bound catalog options and free-text fields; CAS insert races retry through the optimistic update path. | Build + `test:ai-edgecases`, `test:ai-learning-e2e` |
| Typed outcomes and traceability | AI results expose `responseCategory`; `conversation_ai_events` records request ID, versions, language, category, and state versions. | `test:telemetry`, `test:evaluator-safety`, `test:all` |
| Memory trust and deletion | Unconfirmed memory is not projected as verified; expiry removes projections; erasure purges Redis and AI-derived conversation records. | `test:ai-learning`, `test:ai-learning-e2e`, `test:ai-architecture` |
| Gemini-only production graph | Startup, persisted routing reconciliation, runtime routing, and reconfiguration reject Smart NLU in production. | `test:gemini`, `test:ai-architecture`; live production config still required |
| Shadow safety | Shadow evaluation can receive a captured pre-turn state snapshot and remains mutation-disabled. | `test:shadow-immutability`, `test:ai-learning-e2e` |

The local evidence is strong but not equivalent to a production proof. Commit `000feec` is deployed to the configured server, PM2 is online from `/var/www/lion/backend`, `/health` reports database and Redis `UP`, and the `pending_question`, `dedupe_key`, `context_json`, and unique outbox index migrations are present. The release remains pending until the operator records one redacted Meta inbound-to-outbound trace using a real Gemini credential. No credential was changed by this deployment.

## 3. Non-negotiable runtime invariants

These invariants are more important than a prompt. Backend code and database constraints must enforce them.

### Conversation and state

1. Persist the inbound Meta provider message/event before acknowledging the webhook.
2. Deduplicate by provider event/message ID before any Gemini call or mutation.
3. Serialize turns by conversation ID across all PM2 processes, not only inside one Node process.
4. Load durable conversation state plus current database facts on every turn. Redis is a cache, not the only source of unfinished-task meaning.
5. Reject stale turn numbers and never let an older turn overwrite a newer state version.
6. Store the current stage, last assistant question, next required action, expected entity, language/script, cart context, address draft status, and pending order-batch plan.

### Gemini and decision safety

1. Gemini is the only customer language-understanding provider in production. `smart_nlu` must not be selected as stable, candidate, shadow, or fallback behavior.
2. Gemini must produce a typed decision/response category before customer text is accepted.
3. Tool arguments are validated server-side against current catalog, cart, address, customer, and order data.
4. An unclear message, greeting, bare yes, or unreviewed address cannot create an order or perform an unsafe mutation.
5. A known address miss, cart miss, variant miss, product miss, and no-active-order result must never share one generic catalog response.
6. Prices, availability, fees, addresses, order numbers, status, and ETAs come only from verified backend results.

### Customer output

1. Every customer-facing path, including local templates, order lifecycle messages, dashboard replies, and provider-error fallbacks, passes through the plain-text contract.
2. Customer text contains no `*`, `#`, lion emoji, or decorative emoji by default.
3. The response mirrors the latest meaningful customer language and script: English, Lebanese Arabizi, Arabic script, French, or a natural mixed response.
4. A response is concise and asks one useful next question when a next action is needed.

### Side effects and delivery

1. Every mutating tool has a deterministic idempotency key scoped to the conversation turn and action.
2. Order creation requires a final verified summary, a valid address, and an explicit confirmation matching the current plan.
3. A multi-merchant request preserves independent merchant carts and creates independent child orders only after one explicit batch confirmation.
4. AI reply creation is outbox-backed and idempotent by inbound event ID.
5. An outbound message is marked `SENT` only after Meta returns a provider message ID. Unknown provider results are reconciled before retrying, because a crash can occur after Meta accepts a message but before local status is written.

## 4. Error taxonomy and safe handling

| Failure class | Prevention | Customer behavior | Retry policy | Alert/evidence |
|---|---|---|---|---|
| Duplicate webhook | Unique provider event/message key; dedupe before AI | No second reply or mutation | No retry | Event ID, dedupe result |
| Out-of-order/parallel turn | Conversation lock plus optimistic state version | Preserve prior task; ask one clarification if state is stale | Retry state conflict once | Conversation ID, turn/version |
| Gemini 401/403 or invalid key | Startup credential validation; secret rotation procedure | Short service-availability message; no mutation | Permanent; stop retries | HTTP code, model, request ID, no secret |
| Gemini 429/5xx/timeout | Timeout, bounded exponential backoff, circuit breaker | Safe temporary-unavailable message | Retry within budget | latency, attempt, error code |
| Empty/malformed Gemini output | Typed schema validation and bounded tool loop | Language-matched clarification or safe fallback | One controlled retry, then fail closed | response shape and request ID |
| Tool argument/schema failure | Zod/JSON schema and allow-list by stage | Explain the missing/invalid detail | No mutation retry until corrected | tool name, validation code |
| Database connection/deadlock | Pool limits, transactions, deadlock retry | Temporary-unavailable message | Retry deadlocks/transient DB failures | SQL operation name, sanitized error |
| Redis unavailable | Health/readiness check; durable DB state | Continue only if authoritative state can be loaded; otherwise defer | Bounded retry | Redis state and lock errors |
| State payload too large | Length limits, `TEXT/JSON` schema, truncation policy, migration check | Continue with compact summary; never lose business facts | Repair/migrate, then retry | column, byte length, migration version |
| Address not found/unvalidated | Dedicated capture/validation path; no default fallback | Address-specific next step or location pin | No catalog retry | address status, zone result (not raw address) |
| Product/variant miss | Alias/spelling resolution in current merchant context | Name the requested item and verified alternatives | No mutation | query, merchant, result category |
| No active order | Status tool has precedence over catalog | State that there is no active order now | No catalog retry | customer ID, status result |
| Multi-merchant request | Order-batch plan and separate child carts | Show separate summaries and require `confirm both` | Idempotent per child | batch ID, child statuses |
| Meta permanent error | Classify 400/401/403/404 and Meta codes | Do not claim delivery; operator alert | No retry | Meta code, provider ID |
| Meta transient error | Outbox retry and backoff | Do not create another order | Retry within budget | outbox ID, attempt |
| Formatting/language violation | Final output validator plus tests | Sanitize presentation only; preserve facts | Regenerate once if semantics remain valid | response category/language |
| Learning/telemetry failure | Async, redacted, non-blocking telemetry | Never block fulfillment | Retry asynchronously | redacted case ID |

## 5. Required trace for every customer turn

Use one correlation ID across all records. Never log access tokens, app secrets, full phone numbers, or full addresses.

Required fields:

- `request_id` / `turn_correlation_id`;
- Meta `provider_event_id` and provider message ID, hashed or access-controlled where necessary;
- internal `conversation_id`, `customer_id`, inbound message ID, turn index, and state version;
- detected language and script;
- state stage, `next_required_action`, and expected entity;
- Gemini model, prompt version, tool-schema version, latency, token counts, and retry attempt;
- selected intent, response category, tool calls, tool outcomes, and mutation count;
- outbox event ID, Meta outbound provider message ID, delivery/read status, and final error classification;
- redacted error code and a linkable incident/case ID.

A trace is incomplete if it contains only `Sent outbound message`. Add a structured “turn complete” record that shows the inbound event, decision, response category, outbox, and provider result.

Recommended log events:

```text
TURN_RECEIVED
TURN_DEDUPLICATED or TURN_DUPLICATE_SUPPRESSED
STATE_LOADED
GEMINI_DECISION
TOOL_EXECUTED
CUSTOMER_REPLY_VALIDATED
REPLY_OUTBOX_ENQUEUED
META_SEND_ACCEPTED
META_DELIVERY_UPDATED
TURN_COMPLETED
TURN_FAILED
```

## 6. Monitoring and alert thresholds

Create a dashboard with separate panels for inbound, AI, business safety, and delivery. Alert on a rate over a rolling 10-minute window unless noted.

| Metric | Target/alert |
|---|---:|
| Webhook acknowledgement success | 100% 2xx; alert below 99.5% |
| Duplicate inbound suppression | Track count; alert on sudden spike |
| Inbound-to-outbox reply rate | >99%; alert below 98% |
| Meta accepted send rate | >99%; alert below 98% |
| Permanent Meta errors | 0 tolerated; page operator immediately |
| Gemini 401/403 | 0 tolerated; disable customer mutations |
| Gemini timeout/5xx rate | <1%; open incident above 2% |
| Unhandled worker/failed job count | 0 older than 5 minutes |
| Duplicate reply rate | 0 tolerated |
| Duplicate order rate | 0 tolerated |
| Unsafe mutation rate | 0 tolerated |
| Wrong response category | 0 on P0 scenarios |
| Same-language response rate | >=98%; 100% on critical reviewed cases |
| Forbidden presentation characters | 0 customer messages |
| State-version conflicts | Track; alert on sustained growth |
| Queue age | <30 seconds normal; alert above 2 minutes |

The `/health` endpoint checks MySQL and Redis. A healthy response therefore means dependencies answered; it does not mean Meta credentials, Gemini quality, queue age, or customer-facing correctness are healthy. Operations must monitor those separately.

## 7. Production configuration contract

Keep secrets in the server-only environment store. Never place real values in Git, screenshots, chat transcripts, or this document.

For a Gemini/WhatsApp text test, the intended non-secret shape is:

```dotenv
NODE_ENV=production
WHATSAPP_MODE=LIVE
AI_PROVIDER=gemini
AI_ROUTING_MODE=STABLE_ONLY
AI_STABLE_PROVIDER=gemini
AI_CANDIDATE_PROVIDER=gemini
AI_CANARY_PERCENTAGE=0
GEMINI_MODEL=gemini-3.8-flash
GEMINI_MAX_OUTPUT_TOKENS=600
GEMINI_REQUEST_TIMEOUT_MS=120000
WHATSAPP_WORKER_POLL_MS=750
WHATSAPP_WORKER_MAX_RETRIES=3
WHATSAPP_WORKER_STALE_SECONDS=600
MEDIA_MODE=FIXTURE
TRANSCRIPTION_PROVIDER=FIXTURE
VISION_PROVIDER=FIXTURE
```

Required secret variables are present only as placeholders in documentation:

```dotenv
WHATSAPP_PHONE_NUMBER_ID=<Meta phone number ID>
WHATSAPP_GRAPH_API_VERSION=<version supported by Meta account>
WHATSAPP_VERIFY_TOKEN=<private webhook verification token>
WHATSAPP_ACCESS_TOKEN=<rotated Meta access token>
WHATSAPP_APP_SECRET=<Meta app secret>
GEMINI_API_KEY=<Google Gemini API key>
```

Notes:

- `GEMINI_MAX_OUTPUT_TOKENS` is clamped by the current schema to a maximum of 2000; a value such as `60000` does not provide 60000 tokens. Use a deliberate value such as `600` and verify the effective startup value.
- `MEDIA_MODE=FIXTURE` is acceptable for deterministic audio/image demo boundaries only. It is not live transcription or vision.
- `AI_ROUTING_MODE=STABLE_ONLY` with Gemini for both stable and candidate is the only permitted production graph under the current objective.
- The PM2 working directory must be `/var/www/lion/backend` (or the directory containing the intended `.env`) because configuration loading is relative to the process working directory.
- Credentials shown in screenshots or chat must be revoked and replaced. “Temporary” credentials are still compromised once exposed.

## 8. Release and deployment gate

Do not deploy on the basis of a PM2 “online” status or outbound provider IDs alone.

### Before release

1. Confirm the working tree contains no secrets and record the commit SHA.
2. Read the customer-conversation plan and map every P0/P1 item to a test.
3. Build backend and dashboard.
4. Run the focused suites for webhook, failures, conversations, Gemini, language, not-found, architecture, and learning/evaluation.
5. Run the full suite in an isolated database and Redis instance.
6. Run the seven required conversation replays in English, Arabizi, and Arabic where natural.
7. Run a live Meta sandbox test with an authorized recipient; save only redacted evidence.
8. Verify the PM2 `cwd`, `script`, environment mode, and effective AI routing in startup logs.
9. Verify `/health`, queue age, failed jobs, and outbox state.
10. Record rollback commit, database migration status, and operator contact.

### Safe server sequence

Use the operator's approved deployment method; never paste secrets into shell history.

```text
cd /var/www/lion/backend
git pull --ff-only
npm ci
npm run build
pm2 restart lion-delivery --update-env
pm2 describe lion-delivery
pm2 logs lion-delivery --lines 120 --nostream
curl -fsS http://127.0.0.1:4060/health
```

The release is not verified until logs show the expected Gemini-only routing and the live test produces one trace from inbound event through Meta delivery status.

## 9. Test and quality gates

The following gates are release blockers, not advisory metrics:

- 100% of customer replies contain no `*`, `#`, lion emoji, or decorative emoji.
- 100% of unclear messages cause no catalog search, mutation, or order creation.
- 100% of address-stage free text uses address capture, never catalog search.
- 100% of order-status phrases use order-status handling before catalog search.
- 100% of no-active-order cases state that no active order exists, in the sender's language.
- 100% of explicit confirmations are required before order creation.
- 100% of multi-merchant plans preserve both merchant selections and require batch confirmation.
- 100% of product/price/address/order facts are tool-verified.
- At least 98% language/script compliance on the reviewed multilingual corpus, with all critical Arabizi/Arabic cases manually approved.
- 100% context retention across ten or more turns and a Redis restart/reconstruction scenario.
- 100% duplicate-webhook suppression and exactly-once business mutation in replay tests.

Run the repository's suites using the scripts that exist in `backend/package.json`, including the focused architecture, AI-learning, evaluation, routing, language, not-found, telemetry, webhook, failure, conversation, and end-to-end suites. A local deterministic test pass is not a substitute for a live Gemini/Meta sandbox pass; label both evidence types separately.

Required chaos/recovery tests:

- Gemini timeout, 429, 401/403, 5xx, empty response, malformed tool call;
- MySQL outage, deadlock, migration mismatch, and oversized state payload;
- Redis outage, expired lock, stale worker claim, and state-version conflict;
- duplicate and batched Meta webhook payloads;
- crash after a mutating tool succeeds but before reply outbox insertion;
- crash after Meta accepts a message but before local `SENT` status;
- repeated customer delivery of the same confirmation;
- rapid Arabic/Arabizi/English turns in one conversation;
- two merchants with one child-order failure.

## 10. Incident runbooks

### A. Customer receives repeated replies

1. Capture the customer's timestamp and phone privately; do not paste it into a ticket or chat.
2. Search by redacted `request_id`, inbound provider event ID, conversation ID, and outbox IDs.
3. Check whether the inbound webhook was duplicated or whether multiple outbox rows exist for one event.
4. Check worker claims, stale recovery, retry count, and the crash window between Meta acceptance and `SENT` persistence.
5. Pause outbound processing only if duplicate sends are continuing; do not delete events.
6. Reconcile provider message IDs and mark the canonical outbox result.
7. Add the exact replay to the duplicate-suppression regression suite.

### B. Customer gets a generic or wrong-language response

1. Verify the effective runtime provider and prompt version from the trace.
2. Verify the state stage, last question, next action, and last meaningful sender language.
3. Check whether `smart_nlu` or a legacy local template was selected anywhere in the route.
4. Check response category and tool outcome before generation.
5. Check final-output validator results and direct lifecycle/dashboard send paths.
6. Re-run the exact multilingual conversation from a clean state and from persisted state after restart.
7. Quarantine the failing example for human review; do not auto-train it.

### C. Gemini authentication or provider outage

1. Do not rotate a key by editing source or committing `.env`.
2. Confirm the server is loading the intended environment file and that the key is valid in the provider console.
3. Treat 401/403 as permanent and alert an operator; do not retry in a loop.
4. Keep business mutations disabled while provider grounding is unavailable.
5. Restore the provider, run the live smoke test, then drain queued work gradually.

### D. Database state or schema error

1. Capture the exact table/column and migration version.
2. Stop the affected worker or put the service in maintenance mode if state writes are unsafe.
3. Apply the reviewed migration through the normal migration process; do not hand-edit production data without a backup and approval.
4. Verify schema compatibility, then replay one quarantined event.
5. Confirm no duplicate outbox or order mutation before resuming the queue.

### E. Customer says “where is my order?” and receives a catalog reply

1. Verify the intent trace shows `ORDER_STATUS` and a `get_order_status` call before catalog tools.
2. Verify the backend outcome is `NO_ACTIVE_ORDER`, `ACTIVE_ORDER_FOUND`, or `RECENT_ORDER_FOUND`.
3. Confirm the dedicated renderer was used and no generic not-found override replaced it.
4. Add the exact phrase and language variant to the holdout suite.

## 11. Learning without unsafe self-training

The AI must not change its neural weights during a live customer chat. The safe continuous-improvement loop is:

1. Store redacted conversation/decision/tool/outcome traces.
2. Detect repeated questions, correction messages, abandoned checkouts, wrong-language replies, failed address captures, and operator takeovers.
3. Quarantine cases with missing correlation, missing consent, PII, or conflicting business facts.
4. Have a Lebanese Arabic/Arabizi reviewer, operations reviewer, and safety reviewer approve corrections.
5. Add approved cases to a versioned gold dataset with conversation-level train/validation/holdout separation.
6. Run deterministic replay and live Gemini evaluation in a sandbox.
7. Promote a model/prompt only when every P0 gate passes and rollback is prepared.
8. Monitor post-release outcomes and automatically roll back on safety, duplication, grounding, or language regressions.

Training data must never teach silent merchant switching, silent substitutions, default-address selection, automatic order confirmation, invented facts, or exposure of addresses, phone numbers, tokens, or internal IDs.

## 12. Evidence package required for sign-off

Every release or incident closure must attach:

- commit SHA and build output;
- exact effective non-secret configuration and PM2 `cwd`;
- `/health` response and dependency status;
- focused and full test summaries;
- redacted seven-scenario conversation replay results;
- one live Meta inbound-to-outbound trace;
- queue/outbox/failed-job counts;
- response-category and language metrics;
- database migration/schema version;
- rollback reference and reviewer names.

Do not attach raw customer addresses, phone numbers, access tokens, app secrets, or unredacted WhatsApp screenshots.

## 13. Current conclusion for the supplied screenshot

The server log shows healthy startup and Meta outbound acceptance, but it is not a correctness trace. The code-level safeguards and local regression/acceptance suites now pass, including the durable-learning E2E and architecture suites. Commit `000feec` is deployed and health-verified; classify live customer behavior as pending until the operator records:

1. non-secret effective routing/configuration proving Gemini-only production mode;
2. `/health`, queue-age, failed-job, and outbox counts;
3. one redacted live Meta inbound-to-outbound trace; and
4. the seven multilingual customer conversation replays.

“Error-free” is not a defensible claim. The defensible target is zero unsafe mutations, zero duplicate orders/replies, grounded facts, same-language responses, and a bounded, auditable recovery path for every transient failure.
