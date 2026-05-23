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

test("ErpRequestQueue reports queue metrics", async () => {
  const queue = new ErpRequestQueue({ minIntervalMs: 0 });
  let releaseFirst;
  const first = queue.run(async () => {
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
  });
  const second = queue.run(async () => "second");

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(queue.snapshot().running, 1);
  assert.equal(queue.snapshot().queued, 1);

  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(queue.snapshot().running, 0);
  assert.equal(queue.snapshot().queued, 0);
  assert.equal(queue.snapshot().completed, 2);

  await assert.rejects(queue.run(async () => {
    throw new Error("boom");
  }), /boom/);
  assert.equal(queue.snapshot().failed, 1);
  assert.match(queue.snapshot().last_error, /boom/);
});

test("ErpRequestQueue opens circuit after repeated failures", async () => {
  const queue = new ErpRequestQueue({
    minIntervalMs: 0,
    circuitFailureThreshold: 2,
    circuitCooldownMs: 1000
  });
  let executedAfterOpen = false;

  await assert.rejects(queue.run(async () => {
    throw new Error("ERP HTTP 503");
  }), /503/);
  await assert.rejects(queue.run(async () => {
    throw new Error("ERP HTTP 503");
  }), /503/);
  await assert.rejects(queue.run(async () => {
    executedAfterOpen = true;
  }), /熔断中/);

  assert.equal(executedAfterOpen, false);
  assert.equal(queue.snapshot().circuit_state, "open");
  assert.equal(queue.snapshot().consecutive_failures, 2);
  assert.ok(queue.snapshot().circuit_open_until);
});
