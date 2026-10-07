# Testing Policy

## Purpose

This project is a **clinical assessment tool**. The test suite exists to protect **behavioral correctness**, not to maximize coverage or preserve implementation details.

Tests are a cost. Every test must justify itself by protecting something that matters:

* a user-critical flow
* a clinical/business rule
* a previously observed failure

If a test does not clearly do one of these, it should be removed.

---

## Core Principle

> If the code changes and the product does not, tests should mostly stay green.
> If the product breaks in an important way, at least one high-signal test must fail.

---

## Risk Hierarchy (What Must Not Break)

Highest priority (strict protection):

1. **Clinical logic**

   * scoring
   * alerts
   * branching / sequencing
   * interpretation logic

2. **Configuration system**

   * schema validation
   * config resolution (URL, same-origin rules)
   * questionnaire selection and ordering

3. **Report / PDF generation**

   * correctness of output content
   * structure and key values

4. **Core user flows**

   * complete questionnaire → get valid output
   * composer → generates correct URL
   * app loads config correctly

Lower priority (lighter protection):

* UI rendering details
* styling
* layout
* non-critical interaction polish

---

## Testing Layers

### 1. E2E (Playwright) — **System Contracts Only**

Location: `tests/e2e/`

Purpose: prove that the system works when assembled.

Allowed use:

* critical user journeys:

  * load app → complete questionnaire → generate report
  * composer → generate URL → open app with that URL
* config loading behavior (including failure cases)
* navigation and persistence behaviors that only exist in-browser

Not allowed:

* testing detailed logic (scoring, validation, etc.)
* duplicating integration/unit coverage
* testing minor UI variations

Policy:

* keep this suite **small and high-signal**
* new E2E tests require justification: *what real failure would only this catch?*
* flaky E2E tests are treated as defects and must be fixed or removed

---

### 2. Integration Tests — **Primary Confidence Layer**

Locations:

* `src/**/__tests__/`
* `composer/src/**/__tests__/`

Purpose: test real behavior across modules.

Examples:

* config → questionnaire resolution
* questionnaire → scoring → alerts
* input → processing → output shape
* composer logic → generated URL correctness

Guidelines:

* prefer real implementations over mocks
* mock only external or expensive boundaries
* test behavior, not internal structure

This is the **default place** to add tests.

---

### 3. Unit Tests — **Targeted Logic Protection**

Purpose: protect non-trivial logic.

Good candidates:

* scoring functions
* transformations
* parsing/validation logic
* reducers or state transitions

Bad candidates:

* trivial helpers
* passthrough functions
* simple wiring

Guidelines:

* focus on invariants, not examples
* prefer:

  * idempotence
  * monotonicity
  * round-trip properties
* avoid overfitting to implementation details

---

### 4. Component Tests — **Behavior Only**

Purpose: verify meaningful UI behavior.

Allowed:

* user interactions (click, input, navigation)
* accessibility-critical behavior
* conditional rendering that reflects logic

Avoid:

* testing static markup
* snapshot sprawl
* asserting on internal structure or CSS

Rule:

> If a component test breaks during a refactor that doesn’t change behavior, it is too coupled.

---

## What Not to Test

Do **not** write tests for:

* framework behavior
* trivial getters/setters
* static rendering with no logic
* duplicated coverage across layers
* internal implementation details

---

## Regression Policy

Every real bug must result in a test.

Rules:

* place the test at the **lowest effective layer**

  * logic bug → unit or integration
  * cross-module bug → integration
  * system/wiring bug → E2E
* the test must fail before the fix
* the test must clearly encode the failure mode

---

## Test Classification (Mental Model)

Each test should answer one question:

* **“Does the product still work?”** → E2E
* **“Does this rule still hold?”** → integration/unit
* **“Does this bug stay dead?”** → regression

If unclear, the test is likely low-value.

---

## Coverage Policy

Coverage is a **floor**, not a goal.

* maintain reasonable thresholds (to catch neglect)
* do not increase coverage for its own sake
* prefer **branch coverage on critical logic** over global line coverage

Key question:

> What important failure could happen here without a test noticing?

---

## Adding Tests (PR Requirements)

For any non-trivial change:

* include tests at the appropriate layer
* justify E2E additions explicitly
* prefer integration over E2E when possible
* avoid duplicating existing coverage

For bug fixes:

* include a regression test

---

## Deleting Tests

Deleting tests is encouraged when they are:

* redundant
* testing implementation details
* fragile under refactoring
* low-signal (failures don’t indicate real problems)

Removing weak tests is a **net improvement**.

---

## Flakiness Policy

* flaky tests are treated as failures
* do not “retry and ignore”
* fix or remove

---

## CI Expectations

CI enforces:

* lint
* unit/integration tests (Vitest)
* config validation
* build
* bundle size limits
* E2E (Playwright) before deploy

Only **high-confidence builds** are deployable.

---

## Practical Heuristics

* Prefer **fewer, stronger tests** over many shallow ones
* If a refactor breaks many tests without changing behavior → tests are wrong
* If a real bug does not break any test → tests are insufficient
* E2E should feel like a **smoke alarm**, not a surveillance system
* Integration tests should carry most of the weight

---

## Summary

This test suite is designed to be:

* **strict on behavior**
* **flexible on implementation**
* **small at the top (E2E)**
* **strong in the middle (integration)**
* **targeted at the bottom (unit)**

We optimize for **correctness, maintainability, and trust**, not for metrics.
