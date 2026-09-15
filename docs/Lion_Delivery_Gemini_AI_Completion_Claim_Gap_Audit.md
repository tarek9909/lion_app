# Lion Delivery — Gemini AI Completion-Claim Gap Audit

## Verdict

At the time of the original audit, the claim that all 12 implementation areas were **100% complete and verified** was not supported by the codebase.

The original audit identified runtime, evaluator, dataset, search, telemetry, routing, and documentation gaps. Those actionable in-repository findings are now addressed; the remaining external boundaries are called out below.

The local demo may be described as ready in MOCK/FIXTURE mode after the isolated verification recorded in [walkthrough.md](/C:/Projects/lion/walkthrough.md). It must not be described as fully externally verified until live provider and human-review work is complete.

## Remediation update — 2026-09-15

The actionable in-repository gaps in this audit are now implemented and covered by the isolated master runners. The original GAP-01 through GAP-10 and GAP-12 through GAP-15 runtime/documentation corrections are closed locally, including the customer-facing interaction rules below.

The honest remaining boundary is external verification: GAP-11 media/provider evidence and human approval of synthetic training examples require real provider credentials, physical media fixtures, or human review. Those items remain explicitly pending and are not included in a 100% external-verification claim. See [walkthrough.md](/C:/Projects/lion/walkthrough.md) for the reproducible commands and evidence boundary.

## Added customer interaction checklist

- [x] **Catalog miss stays interactive:** when the requested item is absent from the current database-backed catalog, reply exactly: `I couldn't find that within my current catalog. Do you want to choose another item or try a different name?`
- [x] **No fabricated substitutions:** a catalog miss never invents a nearest product or silently changes the requested item.
- [x] **Unclear message asks for clarification:** when a message is not understandable, incomplete, or contradictory, ask the customer to clarify with examples before any cart, address, or order mutation.
- [x] **Conversation remains interactive:** both rules end with a customer-actionable question and are covered by `test-interactive-not-found.ts`.
- [x] **Sender-language consistency:** detect the latest sender language on every turn and reply in that language and script; covered by `test-language-consistency.ts` for English, Arabic, Arabizi, mixed, French, and additional language/script profiles.
- [x] **Gemini-only production path:** production defaults to Gemini, rejects Smart NLU routing at startup, and uses a bounded concise response budget.
- [x] **Responsive customer path:** avoid eager cart reads for read-only tools and overlap independent post-turn persistence work.

## Area Status

The table below is the historical pre-remediation snapshot. The current local status and the remaining external boundary are recorded in the remediation update above.

| Area | Status | Reason |
|---|---|---|
| A — Unified AI routing | Partial | Router is used, but legacy provider/routing configuration can validate successfully and then fail at runtime. |
| B — Shadow zero-mutation boundary | Not complete | `get_active_cart` reaches a create-capable cart method in shadow mode. |
| C — Safe order confirmation | Not complete | Stable Smart NLU bypasses the fingerprint flow; Gemini executor does not enforce the required stage. |
| D — Cross-merchant switching | Broken in real runtime | The turn counter used for isolation is never maintained outside tests. |
| E — Authoritative schemas | Mostly complete | Shared specification exists, but Gemini declarations cannot enforce all Zod refinements and bounds. |
| F — Real evaluator | Partial | Some live-loop repairs exist, but exact typing, order measurement, and sandbox isolation remain inaccurate. |
| G — Dataset validation | Partial | Zod validation exists, but actual JSON Schema is unused and metadata records bypass provenance/review checks. |
| H — Search benchmark | Invalid metric | Reported NDCG exceeds 1.0 and basket cases do not exercise basket comparison. |
| I — Voice and vision | Pending | No physical media files or real external media processing results exist. |
| J — Telemetry and PII | Partial | Pricing and redaction improved, but runtime Gemini failures do not create telemetry records. |
| K — Prompt/few-shot alignment | Not complete | Only five unused exemplars exist; the plan requires 20–40 reviewed traces. |
| L — Master regression harness | Not complete | New safety tests are excluded from master runners; claimed walkthrough file does not exist. |

## Critical Runtime Gaps

### GAP-01 — P0: Default Smart NLU order flow bypasses the new confirmation safeguards

The default stable provider is `smart_nlu`. Its order flow accepts messages such as `yes` or `confirm`, selects a Home address automatically when possible, and immediately creates an order.

It does **not** require:

- A fresh final checkout summary.
- A checkout fingerprint.
- `awaitingConfirmation` to be true.
- The `AWAITING_CONFIRMATION` conversation stage.

This means the Gemini executor safety improvements do not protect the default demo customer path.

Evidence: [ai.service.ts:272](/C:/Projects/lion/backend/src/modules/ai/ai.service.ts:272), [ai.service.ts:291](/C:/Projects/lion/backend/src/modules/ai/ai.service.ts:291), [ai.service.ts:320](/C:/Projects/lion/backend/src/modules/ai/ai.service.ts:320)

Required correction:

1. Route order confirmation from every provider through the same server-side checkout guard, or make Smart NLU call `confirm_and_create_order` through `AiToolsExecutor`.
2. Remove automatic address selection as a confirmation shortcut.
3. Add a regression test for the default `smart_nlu` stable path: populated cart → `yes` without a final summary → no order created.

### GAP-02 — P0: Shadow `get_active_cart` still reaches a create-capable cart path

`get_active_cart` calls `refreshCartSummary(customerId)` without forwarding `shadowMode`. `refreshCartSummary` then calls `getOrCreateActiveCart`, which can insert a cart and recalculates totals through database updates.

An isolated probe with all cart methods mocked recorded:

```text
{ "success": true, "readOnlyCalls": 1, "createCapableCalls": 1 }
```

Evidence: [ai-tools.executor.ts:378](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:378), [ai-tools.executor.ts:215](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:215), [cart.service.ts:47](/C:/Projects/lion/backend/src/modules/carts/cart.service.ts:47)

Required correction:

1. Pass `options?.shadowMode` to `refreshCartSummary` in the `get_active_cart` case.
2. Add a full Gemini shadow regression that requests `get_active_cart` for a customer with no cart.
3. Verify no cart is inserted and no existing cart row, totals, or timestamps change.

### GAP-03 — P0: Gemini confirmation accepts the wrong conversation stage

`confirm_and_create_order` verifies the confirmation flag and address but never checks that the stage is `AWAITING_CONFIRMATION`.

An isolated probe created a simulated order while the state remained `AWAITING_MERCHANT_SWITCH`:

```text
{ "success": true, "stage": "AWAITING_MERCHANT_SWITCH", "action": "ORDER_CONFIRMED" }
```

This can place the existing cart while a merchant-switch request is still pending.

Evidence: [ai-tools.executor.ts:850](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:850), [ai-tools.executor.ts:876](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:876)

Required correction:

1. Require `state.stage === 'AWAITING_CONFIRMATION'` in addition to `awaitingConfirmation`.
2. Reject confirmation when `pendingMerchantSwitch` or `pendingClarification` exists.
3. Add a test proving confirmation fails from every non-checkout stage.

### GAP-04 — P1: Merchant-switch turn isolation never progresses in production

The implementation stores `proposedAtTurn` and compares it with `state.turnIndex`. However, `turnIndex` is not defined in `AIConversationState`, is not initialized, and is not incremented for actual customer messages. It is only assigned manually inside the test.

Both the current and proposed turn therefore default to `1`, permanently rejecting merchant confirmation with `SAME_TURN_SWITCH_FORBIDDEN`.

An isolated two-turn probe returned:

```text
{ "first": "SAME_TURN_SWITCH_FORBIDDEN", "second": "SAME_TURN_SWITCH_FORBIDDEN", "pending": true }
```

Evidence: [ai-tools.executor.ts:446](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:446), [ai-tools.executor.ts:974](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:974), [ai-state.types.ts:77](/C:/Projects/lion/backend/src/modules/ai/state/ai-state.types.ts:77), [test-ai-edgecases.ts:197](/C:/Projects/lion/backend/src/scripts/test-ai-edgecases.ts:197)

Required correction:

1. Add `turnIndex` to `AIConversationState` and initialize it.
2. Increment it exactly once for each inbound customer message before tool execution.
3. Persist it in Redis state.
4. Replace tests that manually set it with true multi-message integration tests.

### GAP-05 — P1: Startup validation does not match the effective router mode

The environment defaults are:

- `AI_PROVIDER=smart_nlu`
- `AI_ROUTING_MODE=STABLE_ONLY`
- `AI_STABLE_PROVIDER=smart_nlu`
- `AI_CANDIDATE_PROVIDER=gemini`

When a user changes only `AI_PROVIDER=gemini`, startup validation still sees `STABLE_ONLY` with Smart NLU and accepts an empty Gemini key. At runtime, the router changes that configuration to `CANDIDATE_ONLY` and invokes Gemini, which fails because there is no key.

An isolated validation probe returned:

```text
{ "accepted": true, "result": { "whatsappValid": true, "mediaValid": true, "aiValid": true } }
```

Evidence: [env.ts:28](/C:/Projects/lion/backend/src/config/env.ts:28), [env.ts:137](/C:/Projects/lion/backend/src/config/env.ts:137), [shadow-canary.service.ts:82](/C:/Projects/lion/backend/src/modules/ai/routing/shadow-canary.service.ts:82)

Required correction:

1. Remove the router’s hidden provider-to-routing-mode override, or centralize effective-mode resolution in one shared configuration function.
2. Validate the exact resolved configuration used by the router.
3. Add a test for `AI_PROVIDER=gemini` with all default routing variables and no key.

## Evaluator and Test-Quality Gaps

### GAP-06 — P1: Evaluator does not provide true exact typing or true exactly-once evidence

The evaluator’s deep argument comparison allows a numeric string to match a number. For example, expected `2` and actual `"2"` are accepted. An isolated probe returned:

```text
{ "match": true }
```

The evaluator also counts a `confirm_and_create_order` function-call attempt as an order confirmation before verifying that the executor successfully created exactly one order. Its exactly-once test runs in deterministic mode, where the evaluator assigns the expected confirmation itself.

Evidence: [evaluator.ts:82](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:82), [evaluator.ts:465](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:465), [evaluator.ts:544](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:544), [test-evaluator-safety.ts:134](/C:/Projects/lion/backend/src/scripts/test-evaluator-safety.ts:134)

The evaluator sandbox also calls real backend services in shadow mode. Search execution writes `search_sessions`, so it is not an isolated fixture sandbox.

Evidence: [evaluator.ts:469](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:469), [catalog.service.ts:199](/C:/Projects/lion/backend/src/modules/catalog/catalog.service.ts:199)

Required correction:

1. Remove number/string coercion from deep exact comparison.
2. Count exactly-once only when a sandboxed order is actually created, then verify duplicate confirmation does not create a second one.
3. Inject an in-memory evaluator tool adapter instead of calling database-backed services.
4. Test multiple tool calls in one model response and multiple model rounds.
5. Keep deterministic fixture scores separate from actual Gemini quality results.

### GAP-07 — P1: Master runners exclude new safety tests

The two new tests introduced for critical corrections are not included in `test:ai-plan`, `test-all`, or any package script:

- `test-shadow-immutability.ts`
- `test-evaluator-safety.ts`

Therefore a reported all-green master test run does not validate the newly claimed Areas B and F.

Evidence: [test-ai-plan.ts:8](/C:/Projects/lion/backend/src/scripts/test-ai-plan.ts:8), [test-all.ts:1](/C:/Projects/lion/backend/src/scripts/test-all.ts:1), [package.json](/C:/Projects/lion/backend/package.json)

Required correction:

1. Add both tests to the relevant package scripts and the master quality runner.
2. Ensure the master runner fails when either test fails.
3. Make tests use a dedicated test database or explicit cleanup, not the shared demo database.

### GAP-08 — P1: The reported master test run is not zero-side-effect

The full test system is not side-effect free:

- `test-gemini.ts` runs `resetDemo()`.
- `test-ai-edgecases.ts` runs `resetDemo()`.
- Dataset tests regenerate dataset files.
- Evaluator tests overwrite `eval_results.json` and `eval_summary.md`.

Evidence: [test-gemini.ts:13](/C:/Projects/lion/backend/src/scripts/test-gemini.ts:13), [test-ai-edgecases.ts:27](/C:/Projects/lion/backend/src/scripts/test-ai-edgecases.ts:27), [test-dataset-validation.ts:16](/C:/Projects/lion/backend/src/scripts/test-dataset-validation.ts:16), [test-evaluator.ts:79](/C:/Projects/lion/backend/src/scripts/test-evaluator.ts:79)

Required correction:

1. Use an isolated test database and temporary artifact directory.
2. Do not describe the current master runner as zero-side-effect.

## Dataset, Search, and Media Gaps

### GAP-09 — P1: Dataset validation does not execute the declared JSON Schema

The validator uses local Zod schemas, but it never loads or executes `datasets/v1/schemas/turn-schema.json`.

Voice, image, and management records also bypass provenance and human-review integrity checks because they are validated and then immediately skipped with `continue`.

Evidence: [dataset-validator.ts:46](/C:/Projects/lion/backend/src/modules/ai/dataset/dataset-validator.ts:46), [dataset-validator.ts:129](/C:/Projects/lion/backend/src/modules/ai/dataset/dataset-validator.ts:129), [dataset-validator.ts:137](/C:/Projects/lion/backend/src/modules/ai/dataset/dataset-validator.ts:137), [turn-schema.json](/C:/Projects/lion/datasets/v1/schemas/turn-schema.json)

The manifest is also inconsistent: it claims 29 synthetic seed records and 6 edge-case records while the total record count is 29.

Evidence: [dataset_manifest.json](/C:/Projects/lion/datasets/v1/dataset_manifest.json)

Required correction:

1. Execute the declared JSON Schema for every applicable turn record, or remove the unused schema and explicitly make Zod the single declared schema.
2. Add provenance and review-status validation to all seven files.
3. Correct the manifest breakdown so categories reconcile to the total.

### GAP-10 — P1: Search NDCG is mathematically invalid, and basket cases do not test basket comparison

The reported NDCG@5 is `1.103`. Normalized DCG cannot exceed `1.0`.

The implementation can count multiple duplicate catalog rows as relevant against one expected product, increasing DCG beyond ideal DCG. It deduplicates for Recall but not for DCG.

Evidence: [test-catalog-search-quality.ts:247](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:247), [test-catalog-search-quality.ts:254](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:254), [test-catalog-search-quality.ts:267](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:267)

The two `MULTI_ITEM_BASKET` cases still call `searchProducts`; they do not invoke `compareBasket` or verify complete-basket success.

Evidence: [test-catalog-search-quality.ts:174](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:174), [test-catalog-search-quality.ts:219](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:219)

Required correction:

1. Count each expected relevant product at most once in DCG.
2. Assert `0 <= NDCG@5 <= 1`.
3. Build separate basket-comparison tests that call `compareBasket` and verify all requested items are found.

### GAP-11 — P1: Voice and image verification is correctly pending, but not complete

No `.ogg`, `.wav`, `.mp3`, `.m4a`, `.png`, `.jpg`, `.jpeg`, or `.webp` fixtures exist in the repository.

Voice metrics are calculated from predefined text transcripts. Image metrics are calculated from manually supplied candidate names and confidence values. The image safety test constructs an action that is already known to be non-mutating instead of exercising the actual vision-to-runtime boundary.

Evidence: [voice-evaluator.ts:148](/C:/Projects/lion/backend/src/modules/media/voice-evaluator.ts:148), [image-evaluator.ts:91](/C:/Projects/lion/backend/src/modules/media/image-evaluator.ts:91), [test-media-evaluation.ts:50](/C:/Projects/lion/backend/src/scripts/test-media-evaluation.ts:50)

Required correction:

1. Keep all acoustic WER and raw image quality claims as `EXTERNAL_VERIFICATION_PENDING` until real fixtures and provider outputs exist.
2. Do not include pending work in a 100% completion claim.
3. When fixtures are available, test the actual transcription/vision boundary and real catalog matching.

## Telemetry and Prompt Gaps

### GAP-12 — P1: Gemini runtime failures do not persist failure telemetry

Gemini network and HTTP failures throw before the normal telemetry block. The current telemetry test writes a failure record directly to `AiTelemetryService`; it does not prove that a failing Gemini request records its own failure.

Evidence: [gemini.service.ts:343](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:343), [gemini.service.ts:350](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:350), [gemini.service.ts:491](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:491), [test-telemetry-redaction.ts:185](/C:/Projects/lion/backend/src/scripts/test-telemetry-redaction.ts:185)

Required correction:

1. Wrap the complete Gemini turn in an error boundary.
2. Persist a telemetry row with `success=false`, `errorCode`, `errorMessage`, and `requestId` before rethrowing.
3. Add an integration test that forces Gemini HTTP 503 through `geminiService.processCustomerMessage` and queries the resulting telemetry row.

### GAP-13 — P1: Conversation ID is inferred, not passed through the runtime chain

The inbound message processor knows the exact persisted `conversationId`, but it calls `aiService.processCustomerMessage` without passing it. Gemini later queries for the latest open conversation instead of receiving the authoritative ID.

Evidence: [whatsapp-message.processor.ts:207](/C:/Projects/lion/backend/src/modules/conversations/whatsapp-message.processor.ts:207), [ai.service.ts:49](/C:/Projects/lion/backend/src/modules/ai/ai.service.ts:49), [gemini.service.ts:177](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:177)

Required correction:

1. Add `conversationId` to `AIService.processCustomerMessage` and router options.
2. Pass the persisted inbound conversation ID directly to Gemini telemetry.
3. Test concurrent conversations for one customer so telemetry cannot attach to the wrong row.

### GAP-14 — P1: Few-shot traces are incomplete and unused

The original plan requires twenty to forty excellent few-shot tool traces. The code exports five examples only, and no runtime code imports or injects them into Gemini requests.

Evidence: [training plan:436](/C:/Projects/lion/docs/Lion_Delivery_Gemini_AI_Training_Plan.md:436), [gemini.system-prompt.ts:58](/C:/Projects/lion/backend/src/modules/ai/prompts/gemini.system-prompt.ts:58)

Required correction:

1. Create 20–40 reviewed, provenance-labeled examples, or keep the requirement explicitly pending.
2. Serialize and inject selected examples into the Gemini prompt, with token-budget limits.
3. Test that the live Gemini payload actually contains the selected few-shot traces.

## Documentation Gap

### GAP-15 — P1: The claimed walkthrough document is absent

The completion report says detailed documentation and logs were published to `walkthrough.md`. No `walkthrough.md` file exists anywhere in the repository.

Required correction:

1. Add the promised walkthrough document.
2. Include only commands that were actually run and outputs that were actually produced.
3. Clearly separate deterministic, database integration, live Gemini, and external pending results.

## Checks Performed During This Audit (Historical Baseline)

The following safe, non-destructive checks passed:

- Backend TypeScript compilation: `npx tsc --noEmit`.
- Dashboard application and Node TypeScript compilation.
- Behavior contract test suite.
- Evaluator safety test suite.
- Media evaluation suite.
- Routing configuration suite.
- Direct read-only dataset validation.

The passing results did not clear the gaps at the time of the original audit because the focused tests did not cover the relevant runtime paths. The remediation and current verification are recorded in [walkthrough.md](/C:/Projects/lion/walkthrough.md).

The full master test suites were intentionally not rerun during this audit because they reset demo data and regenerate artifacts. No application code was edited during this audit.

## Completion Criteria

The project can be described as complete only after:

1. Every customer-facing provider path enforces the same order and cart safety invariants.
2. Shadow execution cannot call any write-capable path, including indirectly through read-only tools.
3. Merchant switch turn isolation uses a real persisted turn counter.
4. Evaluation and benchmark metrics are mathematically valid and measured against isolated runtime behavior.
5. Master runners include every required safety test and do not mutate shared demo state.
6. External media and human-review work is clearly labeled pending rather than counted as completed.
