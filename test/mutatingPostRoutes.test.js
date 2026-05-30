import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const SERVER_SOURCE = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const HTML_SOURCE = fs.readFileSync(new URL("../src/pages/html.js", import.meta.url), "utf8");
const PMC_PAGE_SOURCE = fs.readFileSync(new URL("../src/pages/pmcPage.js", import.meta.url), "utf8");
const PROCEDURE_LINKS_PAGE_SOURCE = fs.readFileSync(new URL("../src/pages/procedureLinksPage.js", import.meta.url), "utf8");
const USER_ROLES_PAGE_SOURCE = fs.readFileSync(new URL("../src/pages/userRolesPage.js", import.meta.url), "utf8");
const USER_ROLES_QUERY_SOURCE = fs.readFileSync(new URL("../src/queries/userRolesQuery.js", import.meta.url), "utf8");

test("state-changing application routes use POST instead of GET", () => {
  const mutatingRoutes = [
    "/pmc/intervention/save",
    "/procedure-links/save",
    "/user-roles/save",
    "/user-roles/reset-password",
    "/user-roles/delete",
    "/history-sync/window/run",
    "/history-sync/run"
  ];

  for (const route of mutatingRoutes) {
    assert.doesNotMatch(
      SERVER_SOURCE,
      new RegExp(`req\\.method === "GET" && url\\.pathname === "${escapeRegExp(route)}"`),
      `${route} must not mutate through GET`
    );
    assert.match(
      SERVER_SOURCE,
      new RegExp(`req\\.method === "POST" && url\\.pathname === "${escapeRegExp(route)}"`),
      `${route} should have a POST route`
    );
  }
});

test("sync status routes may be GET but only POST can mutate sync state", () => {
  assert.match(SERVER_SOURCE, /req\.method === "POST" && url\.pathname === "\/sync"/);
  assert.match(SERVER_SOURCE, /req\.method === "POST" && url\.pathname === "\/sync-pause"/);
  const syncGetBlock = routeBlock("/sync", "GET");
  const pauseGetBlock = routeBlock("/sync-pause", "GET");
  assert.doesNotMatch(syncGetBlock, /syncCoreData\(/);
  assert.doesNotMatch(pauseGetBlock, /setSyncPaused\(/);
});

test("state-changing API routes use POST instead of GET", () => {
  for (const route of ["/api/history_sync/run", "/api/history_sync/window/run", "/api/sync"]) {
    assert.doesNotMatch(
      SERVER_SOURCE,
      new RegExp(`req\\.method === "GET" && url\\.pathname === "${escapeRegExp(route)}"`),
      `${route} must not mutate through GET`
    );
    assert.match(
      SERVER_SOURCE,
      new RegExp(`req\\.method === "POST" && url\\.pathname === "${escapeRegExp(route)}"`),
      `${route} should have a POST route`
    );
  }
});

test("forms that save local records submit by POST", () => {
  assert.match(PMC_PAGE_SOURCE, /action="\/pmc\/intervention\/save" method="post"/);
  assert.match(PROCEDURE_LINKS_PAGE_SOURCE, /action="\/procedure-links\/save" method="post"/);
  assert.match(USER_ROLES_PAGE_SOURCE, /action="\/user-roles\/save" method="post"/);
});

test("shared action rendering turns mutating hrefs into POST buttons", () => {
  assert.match(HTML_SOURCE, /function renderActionControl/);
  assert.match(HTML_SOURCE, /function renderPostButtonFromHref/);
  assert.match(HTML_SOURCE, /isMutatingHref/);
});

test("user role table actions point to POST action descriptors", () => {
  assert.match(USER_ROLES_QUERY_SOURCE, /delete_action:\s*\{\s*label:\s*"删除"/s);
  assert.match(USER_ROLES_QUERY_SOURCE, /reset_action:\s*userPasswordResetAction/);
  assert.doesNotMatch(USER_ROLES_QUERY_SOURCE, /delete_action:\s*`\/user-roles\/delete/);
  assert.doesNotMatch(USER_ROLES_QUERY_SOURCE, /return `\/user-roles\/reset-password/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routeBlock(route, method) {
  const needle = `req.method === "${method}" && url.pathname === "${route}"`;
  const start = SERVER_SOURCE.indexOf(needle);
  assert.notEqual(start, -1, `missing ${method} route for ${route}`);
  const next = SERVER_SOURCE.indexOf("\n    if (", start + needle.length);
  const end = next === -1 ? SERVER_SOURCE.indexOf("\n    sendJson", start) : next;
  return SERVER_SOURCE.slice(start, end === -1 ? undefined : end);
}
