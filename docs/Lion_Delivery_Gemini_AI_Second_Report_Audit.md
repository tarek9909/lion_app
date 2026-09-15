# Lion Delivery — Gemini AI Second Implementation Report Audit

## Verdict

The second Antigravity implementation report is **not fully true or complete**.

The project contains meaningful improvements, but the report incorrectly claims that all previous findings were resolved. Several critical issues remain in the demo implementation, especially around Gemini routing, shadow-mode safety, merchant switching, order confirmation, and live evaluation.

These findings are specific to the Lion Delivery demo and its Gemini AI training/quality plan. Some issues are visible only when Gemini, shadow, or canary mode is enabled, but they are still relevant because those modes are part of the reported implementation.

## Claim Classification

| Status | Findings |
|---|---|
| Fully resolved | 2.1, 2.2, 3.3, 5.2, 8.1 |
| Partially resolved | 1.2, 3.1, 3.2, 4.1, 4.2, 7.1, 9.1 |
| Not resolved | 1.1, 2.3, 2.4, 5.1, 6.1, 7.2 |

## Critical Unresolved Findings

### 1. P0 — Gemini bypasses the routing layer

When `AI_PROVIDER=gemini`, `ai.service.ts` calls Gemini directly instead of calling `shadowCanaryRouter`. Therefore:

- Shadow and canary settings are ignored when Gemini is the primary provider.
- The runtime wiring diagram in the report is inaccurate.
- The claim that all customer messages pass through the router is false.

Evidence: [ai.service.ts:54](/C:/Projects/lion/backend/src/modules/ai/ai.service.ts:54)

### 2. P0 — Shadow mode can mutate demo data

Shadow mode is not a complete sandbox. The Gemini service can:

- Create a customer record.
- Create an active cart.
- Update a cart variant while resolving a pending clarification.
- Read or recalculate cart data through real services.

The direct variant update occurs before the `shadowMode` guard.

Evidence: [gemini.service.ts:138](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:138), [gemini.service.ts:184](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:184), and [ai-tools.executor.ts:189](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:189)

The report’s claim that database and Redis mutations are completely suppressed is therefore false.

### 3. P0 — A fresh order summary is not enforced

Selecting an address sets `awaitingConfirmation=true`, but later cart mutations do not reset that flag or invalidate the previous summary.

This allows the following unsafe sequence:

1. The customer receives a final order summary.
2. The customer changes the cart.
3. The customer sends `confirm`.
4. The changed cart can be placed without a new summary being shown.

Evidence: [ai-tools.executor.ts:632](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:632) and [ai-tools.executor.ts:675](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:675)

The report’s claim that the server enforces a fresh summary is false.

### 4. P0 — Merchant switching does not validate explicit approval

`switch_merchant_confirm` checks only whether a pending merchant switch exists. It does not verify that the current customer message contains an explicit approval phrase.

The initial cross-merchant add returns a failed tool result, so the Gemini mutation counter is not necessarily incremented. Gemini can then call `switch_merchant_confirm` in the same turn and clear the cart without a separately validated approval.

Evidence: [ai-tools.executor.ts:764](/C:/Projects/lion/backend/src/modules/ai/tools/ai-tools.executor.ts:764)

The report’s claim that carts are never cleared without explicit customer approval is false.

### 5. P0 — The live evaluator is not a trustworthy real-model evaluator

The evaluator now attempts a real Gemini request, which is an improvement. However, it still has major correctness problems:

- The tools payload is double-wrapped. `getAuthoritativeGeminiToolDeclarations()` already returns the `functionDeclarations` wrapper, but the evaluator wraps it again.
- It performs only one Gemini request and does not execute a real function-call/function-response loop.
- It does not execute returned tools against the real state machine.
- State transitions in live mode remain based on the initial state.
- API errors can still result in a report with `status: 'COMPLETED'`.
- `confirmedOrderExactlyOnceRate` is hardcoded to `1.0`.

Evidence: [evaluator.ts:305](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:305), [evaluator.ts:601](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:601), and [evaluator.ts:619](/C:/Projects/lion/backend/src/modules/ai/evaluation/evaluator.ts:619)

The deterministic evaluation results must not be presented as evidence of live Gemini quality.

## Additional Incomplete or Misleading Claims

### Tool schemas are still manually duplicated

The report says the declarations are generated from authoritative Zod schemas. In reality, the Gemini declarations are manually written in the same module and are not generated from the schemas.

There are still unsafe divergences:

- Missing cart quantity defaults to `1`.
- Missing notes become an empty string.
- Missing address labels become an empty string.
- Merchant-switch confirmation defaults to `true`.
- Gemini declarations do not require several arguments required by the intended behavior.

Evidence: [tool-schemas.ts:37](/C:/Projects/lion/backend/src/modules/ai/contract/tool-schemas.ts:37) and [tool-schemas.ts:105](/C:/Projects/lion/backend/src/modules/ai/contract/tool-schemas.ts:105)

### Search quality does not meet the original plan gate

The actual benchmark produces:

- Recall@5: **87.0%**
- NDCG@5: **0.945**
- MRR: **0.848**
- No-result accuracy: **100.0%**

The benchmark passes because the assertion was lowered to 85%. The original Gemini plan requires Search Recall@5 of at least 95%.

Evidence: [test-catalog-search-quality.ts:284](/C:/Projects/lion/backend/src/scripts/test-catalog-search-quality.ts:284) and [training plan:691](/C:/Projects/lion/docs/Lion_Delivery_Gemini_AI_Training_Plan.md:691)

### Dataset validation is not full JSON Schema validation

The validator checks the seven expected files and detects customer/conversation split leakage. However, it does not execute the declared JSON Schema against every record. Several record types receive only partial field-presence checks.

The current dataset is also still synthetic and unreviewed. The 3,000–5,000 human-reviewed-turn target remains incomplete.

Evidence: [dataset-validator.ts:73](/C:/Projects/lion/backend/src/modules/ai/dataset/dataset-validator.ts:73)

### Voice and image evaluation remain synthetic

No real audio or image fixture files are present in the repository.

Voice metrics use supplied transcripts rather than actual audio transcription. Image matching uses manually supplied product candidates and confidence values rather than a real vision-to-catalog pipeline.

The image safety test constructs a proposed action and checks it, but does not prove the complete production image-processing path.

Evidence: [voice-evaluator.ts:148](/C:/Projects/lion/backend/src/modules/media/voice-evaluator.ts:148) and [image-evaluator.ts:93](/C:/Projects/lion/backend/src/modules/media/image-evaluator.ts:93)

### Telemetry is only partially corrected

Gemini usage metadata is now read from the API, which is correct. However:

- `conversationId` is always recorded as `null` in the Gemini service.
- `success` is hardcoded to `true`.
- Exceptions before telemetry persistence can produce no interaction record.
- Language detection defaults to the stored preferred language or Arabizi.
- Estimated costs use incorrect constants.

The code uses `$0.000000075` per input token and `$0.0000003` per output token. Google’s current Gemini 3.8 Flash standard pricing is $0.75 per million input tokens and $3.75 per million output tokens through December 31, 2026. Therefore the input estimate is 10 times too low and the output estimate is 12.5 times too low.

Evidence: [gemini.service.ts:416](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:416), [gemini.service.ts:433](/C:/Projects/lion/backend/src/modules/ai/gemini.service.ts:433), and [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Tests and Verification

The following safe checks passed:

- Backend TypeScript compilation.
- Dashboard TypeScript compilation.
- Behavior-contract test suite.
- Media evaluation test suite.

However, these passing tests do not prove the claims made in the report:

- The behavior-contract test checks that tool names and selected properties exist; it does not compare Zod schemas with Gemini declarations.
- The media suite uses synthetic in-memory inputs.
- The shadow test checks for the existence of a recent telemetry row but does not verify cart/state immutability.
- The edge-case test does not cover the fresh-summary invalidation or explicit merchant-switch approval paths.
- The Gemini integration suite uses a mocked fetch function for Gemini responses, not a live Gemini model.

The full master tests were not rerun during this audit because they reset database state and generate artifacts. No code was modified during the audit.

## Final Decision

The second implementation report should be marked **incomplete and not production-ready**.

The implementation is suitable for continued demo development, but Antigravity must correct the unresolved P0 safety issues before enabling Gemini shadow, canary, or live customer operation:

1. Route every provider mode through one routing layer.
2. Make shadow mode genuinely read-only and mutation-free.
3. Require and validate explicit merchant-switch approval.
4. Invalidate the confirmation state after every cart mutation.
5. Build a real multi-round evaluator with honest failure status and measured exactly-once order behavior.

