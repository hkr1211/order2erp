import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { setSyncPaused, syncPauseStatus } from "../src/syncPause.js";

test("sync pause status follows local pause flag", () => {
  const flagPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sync-pause-")), "sync-paused");

  assert.equal(syncPauseStatus({ flagPath }).paused, false);

  setSyncPaused(true, { flagPath });
  assert.equal(syncPauseStatus({ flagPath }).paused, true);

  setSyncPaused(false, { flagPath });
  assert.equal(syncPauseStatus({ flagPath }).paused, false);
});
