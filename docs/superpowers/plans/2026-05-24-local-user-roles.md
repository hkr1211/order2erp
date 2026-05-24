# Local User Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintainable SQLite role configuration so non-followup staff such as finance managers do not appear in the followup workbench.

**Architecture:** Store local staff role overrides in SQLite, expose them through `localDb.js`, pass them into `buildLocalPmcDashboard`, and show a read-only system page for current role configuration. Keep existing conservative status filtering for completed orders.

**Tech Stack:** Node.js, `node:sqlite`, existing server-rendered HTML module pages, existing `node:test` suite.

---

### Task 1: SQLite Role Configuration

**Files:**
- Modify: `src/localDb.js`
- Test: `test/localDbInterventions.test.js`

- [ ] Write tests for saving/listing local user role rows, including `is_followup = 0`.
- [ ] Add `local_user_roles` table with `name`, `role`, `is_followup`, `note`, `updated_at`.
- [ ] Add `saveLocalUserRole` and `listLocalUserRoles`.
- [ ] Seed `葛梓` as `财务经理 / 非跟单` when missing.
- [ ] Run `npm run check`.

### Task 2: Analytics Uses Role Configuration

**Files:**
- Modify: `src/localAnalytics.js`
- Modify: `src/server.js`
- Test: `test/localAnalytics.test.js`

- [ ] Add a failing test proving `buildLocalPmcDashboard` excludes users marked `is_followup = 0`.
- [ ] Pass local role rows from `queryLocalPmcDashboard` into `buildLocalPmcDashboard`.
- [ ] Replace hard-coded non-followup name checks with role configuration.
- [ ] Run `npm run check`.

### Task 3: System Role Page

**Files:**
- Modify: `src/server.js`

- [ ] Add `/user-roles` route.
- [ ] Render configured roles and detected followup owners in a module page.
- [ ] Add “角色配置” to the system page module list and system-related actions.
- [ ] Restart local server and verify `/user-roles` and `/followup` in browser.
- [ ] Commit the change.
