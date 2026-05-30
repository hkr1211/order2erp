# Unified Risk Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the ERP query hub around a standard business model, unified risk model, role-scoped risk consumption, AI answers grounded in standard data, and next-stage BOM/batch/prediction analytics.

**Architecture:** Add focused model modules under `src/models/`, keep SQLite sync untouched, and have analytics/query modules consume standard models instead of ad hoc row shapes. Existing pages stay in place; this plan improves the data contracts underneath them first.

**Tech Stack:** Node.js ES modules, SQLite-backed local data access, Node test runner.

---

### Task 1: Data Dictionary And Standard Models

**Files:**
- Create: `src/models/businessModels.js`
- Test: `test/businessModels.test.js`

- [ ] Write tests for dictionary coverage and normalized order/procedure/material/finance records.
- [ ] Run `node --test test/businessModels.test.js` and confirm it fails because `src/models/businessModels.js` does not exist.
- [ ] Implement standard field dictionaries and normalization helpers.
- [ ] Run `node --test test/businessModels.test.js`.

### Task 2: Unified Risk Model

**Files:**
- Create: `src/models/riskModel.js`
- Modify: `src/localAnalytics.js`
- Test: `test/riskModel.test.js`, `test/localAnalytics.test.js`

- [ ] Write tests proving every PMC red/yellow risk has a stable `risk_id`, `risk_level`, `risk_type`, `related_object`, `related_no`, `source_table`, `source_key`, `source_rule`, `match_method`, `owner_role`, `responsible_owner`, `suggested_action`, `status`, and `buttons`.
- [ ] Run the tests and confirm they fail on missing exports/fields.
- [ ] Implement risk constructors and adapt PMC risk rows to emit the unified shape while preserving existing display fields.
- [ ] Run `node --test test/riskModel.test.js test/localAnalytics.test.js`.

### Task 3: Shared Risk Consumption

**Files:**
- Create: `src/models/riskSelectors.js`
- Modify: `src/queries/ordersQuery.js`, `src/queries/financeQuery.js`, `src/queries/pmcQuery.js`
- Test: `test/riskSelectors.test.js`, `test/queryCenters.test.js`

- [ ] Write tests for role-scoped selectors used by order, followup, finance, and PMC query centers.
- [ ] Run the tests and confirm they fail before selectors exist.
- [ ] Implement selectors that filter by role, owner, customer, counterparty, related object, and risk status.
- [ ] Wire query modules to consume selectors without changing page layout.
- [ ] Run `node --test test/riskSelectors.test.js test/queryCenters.test.js test/authAccess.test.js`.

### Task 4: AI Standard Model Querying

**Files:**
- Modify: `src/queries/aiChatQuery.js`
- Test: `test/aiChatQuery.test.js`

- [ ] Write tests proving AI answers include source table, structured filters, hit count, and clarification when customer/country/status terms are ambiguous.
- [ ] Run `node --test test/aiChatQuery.test.js` and confirm failure.
- [ ] Route AI intent handling through standard model helpers and risk selectors only.
- [ ] Run `node --test test/aiChatQuery.test.js test/authAccess.test.js`.

### Task 5: BOM, Batch Flow, Prediction Readiness

**Files:**
- Create: `src/models/materialPlanning.js`
- Modify: `src/localAnalytics.js`
- Test: `test/materialPlanning.test.js`, `test/localAnalytics.test.js`

- [ ] Write tests for conservative BOM kit checks, batch handoff matching, and delivery-risk prediction suggestions.
- [ ] Run the tests and confirm failure on missing model.
- [ ] Implement BOM and batch helpers using available SQLite rows; mark unavailable data explicitly instead of guessing.
- [ ] Add prediction suggestions as advisory fields on existing PMC risk rows.
- [ ] Run `npm run check`.
