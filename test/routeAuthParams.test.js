import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const SERVER_SOURCE = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("business page routes pass authenticated users into query params", () => {
  const scopedRoutes = [
    ["/pmc/brief.txt", "pmc"],
    ["/pmc/brief", "pmc"],
    ["/pmc/intervention", "pmc"],
    ["/procedure-links", "production"],
    ["/order", "orders"],
    ["/materials", "material"],
    ["/procurement", "procurement"],
    ["/foreign-trade", "orders"],
    ["/production", "production"],
    ["/dispatch", "production"],
    ["/workshop-board", "production"],
    ["/scheduling", "orders"],
    ["/interventions", "pmc"],
    ["/interventions/export.csv", "pmc"],
    ["/reports", "reports"],
    ["/reports/export.csv", "reports"],
    ["/reports/export.xls", "reports"],
    ["/reports/print", "reports"]
  ];

  for (const [route, resource] of scopedRoutes) {
    const block = routeBlock(route);
    assert.match(
      block,
      new RegExp(`authParams\\(Object\\.fromEntries\\(url\\.searchParams\\), currentUser, "${resource}"\\)`),
      `${route} should include currentUser via authParams`
    );
  }
});

test("workshop section routes pass authenticated users into board query params", () => {
  const block = blockAfter("WORKSHOP_ROUTE_TO_KEY[url.pathname]");
  assert.match(
    block,
    /authParams\(Object\.fromEntries\(url\.searchParams\), currentUser, "production"\)/,
    "workshop section routes should include currentUser via authParams"
  );
});

function routeBlock(route) {
  return blockAfter(`url.pathname === "${route}"`);
}

function blockAfter(needle) {
  const start = SERVER_SOURCE.indexOf(needle);
  assert.notEqual(start, -1, `missing route block for ${needle}`);
  const next = SERVER_SOURCE.indexOf("\n    if (", start + needle.length);
  const end = next === -1 ? SERVER_SOURCE.indexOf("\n    sendJson", start) : next;
  return SERVER_SOURCE.slice(start, end === -1 ? undefined : end);
}
