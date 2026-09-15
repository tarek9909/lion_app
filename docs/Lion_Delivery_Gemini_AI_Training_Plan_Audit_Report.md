# Lion Delivery Gemini AI Training Plan Audit Report

**Audit date:** 2026-09-15  
**Reviewed artifact:** Antigravity implementation report  
**Reference plan:** [`Lion_Delivery_Gemini_AI_Training_Plan.md`](./Lion_Delivery_Gemini_AI_Training_Plan.md)

## Executive verdict

The Antigravity report is **not fully true or complete**. The repository contains useful implementation scaffolding, but the central claim that all phases are implemented and verified is not supported.

The most important issue is that the reported Gemini quality metrics do not measure Gemini. The evaluator copies the expected tool and arguments into the result, including in `REAL_GEMINI` mode. The new contract, state, prompt, telemetry, and routing modules are also not connected to the live customer-facing Gemini path.

This should be treated as a **partial prototype**, not as production-ready AI training or quality verification.

## Critical findings

### 🔴 P0 — The live Gemini evaluator is simulated

Location: [`evaluator.ts`](../backend/src/modules/ai/evaluation/evaluator.ts#L107)

The `REAL_GEMINI` branch does not call the Gemini API. It assigns `actualTool` and `actualArgs` from the dataset’s expected values and returns the fixed response `Grounded real Gemini response.`

As a result, the reported 100% tool, argument, clarification, and language metrics do not measure model behavior. The live-evaluation runbook in the Antigravity report is therefore not valid.

The evaluator also marks required reply facts as present even when they are absent ([`evaluator.ts`](../backend/src/modules/ai/evaluation/evaluator.ts#L147)).

### 🔴 P0 — The new architecture is not connected to customer conversations

The production conversation path dispatches directly to the existing Gemini service ([`ai.service.ts`](../backend/src/modules/ai/ai.service.ts#L47)). The live Gemini service still owns its own prompt, state handling, tool declarations, and tool executor ([`gemini.service.ts`](../backend/src/modules/ai/gemini.service.ts#L391), [`gemini.service.ts`](../backend/src/modules/ai/gemini.service.ts#L421)).

The new behavior contract, shared state model, shared executor, versioned prompt, and telemetry service are not used by this customer path. Therefore the following report claims are false or incomplete:

- unified orchestration;
- versioned prompt used in production;
- sanitized state supplied to Gemini;
- one authoritative tool schema;
- complete customer-turn telemetry;
- unified Gemini and local-provider safety behavior.

### 🔴 P0 — Shadow mode does not execute a candidate model

Location: [`shadow-canary.service.ts`](../backend/src/modules/ai/routing/shadow-canary.service.ts#L108)

The shadow function only writes a telemetry record containing a placeholder message. It does not call Gemini or any candidate provider. The router is also not connected to the WhatsApp/customer runtime.

Therefore “mutation-disabled candidate execution,” live shadow comparison, environment-based routing, and operational rollback are not complete.

### 🔴 P0 — The claimed quality gates are not measured

The report claims results for invented operational facts, exactly-once order creation, multi-turn completion, and golden-demo success. The evaluator does not implement these metrics.

Other metric problems include:

- “Macro F1” is calculated as simple overall accuracy.
- Missing expected arguments pass validation.
- Required reply facts cannot fail.
- No real provider latency or token usage is measured.
- Cost is a fixed estimate of `$0.00015` per record.
- The generated report explicitly identifies the model as `simulated-gemini-3.8-flash` ([`eval_summary.md`](../datasets/v1/eval_summary.md#L5)).

### 🟡 P1 — The dataset is far below the training plan

The current evaluation corpus contains only 23 core records. The plan requires approximately 3,000–5,000 human-reviewed turns, including hundreds of multi-turn conversations, safety examples, real voice samples, and representative images ([`training plan`](./Lion_Delivery_Gemini_AI_Training_Plan.md#L307)).

The current core language distribution is also unbalanced:

| Language | Records |
|---|---:|
| English | 10 |
| Lebanese Arabizi | 9 |
| Lebanese Arabic script | 2 |
| Standard Arabic | 1 |
| Mixed/code-switched | 1 |

The dataset builder provides one seven-turn conversation and a small set of synthetic examples. It is not a gold dataset suitable for model-quality claims.

### 🟡 P1 — Dataset schema validation is incomplete

The JSON schema file exists, but the validator never loads it. It validates only four files and a small set of required fields ([`dataset-validator.ts`](../backend/src/modules/ai/dataset/dataset-validator.ts#L32)).

It does not validate the voice, image, or management datasets, and it does not enforce the full JSON schema. Split isolation is checked by conversation ID only, not by customer identity as required by the plan.

### 🔴 P0 — Safety claims are not fully enforced by the live path

The live Gemini loop rejects multiple mutating function calls returned in one model response, but it does not maintain a mutation counter across successive tool-calling rounds in the same customer turn ([`gemini.service.ts`](../backend/src/modules/ai/gemini.service.ts#L1060)). The claimed “one mutation per turn” invariant is therefore incomplete.

The unused shared executor also contains correctness problems:

- `updateItemQuantity()` returns an object even on failure, but the executor checks only whether the object is truthy ([`ai-tools.executor.ts`](../backend/src/modules/ai/tools/ai-tools.executor.ts#L291)).
- Notes and removal failures are reported as successful.
- Order confirmation checks explicit wording, address, and cart contents, but do not require `state.awaitingConfirmation` or proof that a fresh final summary was shown ([`ai-tools.executor.ts`](../backend/src/modules/ai/tools/ai-tools.executor.ts#L465)).

### 🟡 P1 — Customer telemetry and PII protection are incomplete

The telemetry service works in isolation, but the customer-facing Gemini path does not call it. Customer interactions therefore do not reliably persist prompt version, tool traces, state before/after, token counts, cost, corrections, or search conversion.

The redactor declares an address regex but never applies it ([`pii-redactor.ts`](../backend/src/modules/ai/telemetry/pii-redactor.ts#L35)). Full building, floor, apartment, and landmark addresses can remain in telemetry. Customer/operator names are not generally redacted either.

### 🟡 P1 — Voice and image evaluation is synthetic

The voice evaluator checks five prewritten transcripts using keyword matching; it does not transcribe audio or calculate WER ([`voice-evaluator.ts`](../backend/src/modules/media/voice-evaluator.ts#L76)).

The image evaluator receives manually supplied candidate objects and hardcodes direct cart mutation to `false` ([`image-evaluator.ts`](../backend/src/modules/media/image-evaluator.ts#L71)). The referenced audio and image fixture files are not present in the repository.

These tests prove only the evaluator’s own assumptions, not real voice or vision quality.

### 🟡 P1 — Management AI is read-only but can invent operational facts

Authentication and fixed read-only SQL functions are present. However, several queries do not filter by date while the response says “today.” Responses also include facts that are not queried, including:

- “due to peak kitchen load”;
- “zero delivery complaints”;
- “active couriers are currently available and stationed across Saida Central”;
- “Operations are running smoothly.”

Examples are visible in [`management-ai.service.ts`](../backend/src/modules/management-ai/management-ai.service.ts#L99), [`management-ai.service.ts`](../backend/src/modules/management-ai/management-ai.service.ts#L140), and [`management-ai.service.ts`](../backend/src/modules/management-ai/management-ai.service.ts#L194).

This contradicts the plan’s zero-invented-facts requirement.

### 🟡 P1 — Search evaluation is too small and overstates Recall@5

The search benchmark contains only seven hand-selected queries. It counts a query as a hit when any one expected product appears in the top five, even when multiple relevant products are expected. That is not a complete Recall@5 calculation ([`test-catalog-search-quality.ts`](../backend/src/scripts/test-catalog-search-quality.ts#L71)).

The catalog improvement is primarily lexical normalization and preference sorting. Semantic retrieval, no-result analysis, merchant-selection accuracy, basket completion, and search-to-cart conversion are not demonstrated.

## Claims that are supported

- The listed contract, dataset, evaluator, prompt, telemetry, media, management, and routing files exist.
- The behavior contract contains 18 intents, five language codes, eleven stages, and six clarification types.
- Backend and dashboard TypeScript checks currently pass with no emit.
- The isolated behavior-contract test passes.
- The isolated synthetic media test passes.
- No SQL schema file was modified by this work.
- No fine-tuned remote model was deployed.
- `gemini-3.8-flash` is a valid Gemini model identifier according to Google’s official documentation.

These facts do not establish that the customer-facing Gemini system meets the training plan’s quality gates.

## Verification performed for this audit

- Read-only repository and wiring inspection.
- Backend TypeScript check: passed.
- Dashboard TypeScript checks: passed.
- Behavior-contract test: passed.
- Synthetic voice/image test: passed.
- Direct evaluator check with an invalid API key: returned simulated 100% results without calling Gemini.
- Direct PII check: detailed address text remained unredacted.

The database-mutating master suites were not rerun because this audit was requested without code changes and those suites regenerate artifacts and write test telemetry.

## Final disposition

Do not approve the Antigravity report as a completion report. The next implementation pass must first connect the new contract/state/prompt/executor/telemetry/router to the live customer path, replace the evaluator with a real Gemini harness, expand the reviewed dataset, and rerun the quality gates against real model outputs.
