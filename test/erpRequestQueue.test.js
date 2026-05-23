import test from "node:test";
import assert from "node:assert/strict";
import { ErpRequestQueue } from "../src/erpRequestQueue.js";

test("ErpRequestQueue runs ERP operations one at a time", async () => {
  const queue = new ErpRequestQueue({ minIntervalMs: 0 });
  const events = [];
  let releaseFirst;

  const first = queue.run(async () => {
    events.push("first-start");
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    events.push("first-end");
    return "first";
  });
  const second = queue.run(async () => {
    events.push("second-start");
    return "second";
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(events, ["first-start"]);
  releaseFirst();

  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(events, ["first-start", "first-end", "second-start"]);
});

test("ErpRequestQueue waits between ERP operations", async () => {
  const queue = new ErpRequestQueue({ minIntervalMs: 20 });
  const startedAt = [];

  await Promise.all([
    queue.run(async () => startedAt.push(Date.now())),
    queue.run(async () => startedAt.push(Date.now()))
  ]);

  assert.ok(startedAt[1] - startedAt[0] >= 15);
});
