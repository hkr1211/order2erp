import test from "node:test";
import assert from "node:assert/strict";
import { ErpClient } from "../src/erpClient.js";
import { ErpRequestQueue } from "../src/erpRequestQueue.js";

class FakeErpClient extends ErpClient {
  constructor({ result, requestLogger }) {
    super({
      username: "u",
      password: "p",
      requestLogger,
      requestQueue: new ErpRequestQueue({ minIntervalMs: 0 })
    });
    this.result = result;
  }

  async postJsonNow() {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }
}

test("ErpClient logs successful ERP requests", async () => {
  const logs = [];
  const client = new FakeErpClient({
    result: { header: { status: 0 } },
    requestLogger: (entry) => logs.push(entry)
  });

  await client.postJson("/ok", { a: 1 });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].path, "/ok");
  assert.equal(logs[0].status, "success");
  assert.equal(logs[0].error_message, "");
  assert.ok(logs[0].duration_ms >= 0);
});

test("ErpClient logs failed ERP requests", async () => {
  const logs = [];
  const client = new FakeErpClient({
    result: new Error("ERP HTTP 503"),
    requestLogger: (entry) => logs.push(entry)
  });

  await assert.rejects(client.postJson("/fail", {}), /503/);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].path, "/fail");
  assert.equal(logs[0].status, "failed");
  assert.match(logs[0].error_message, /503/);
});
