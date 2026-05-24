import fs from "node:fs";
import path from "node:path";

const DEFAULT_FLAG_PATH = path.resolve("data/sync-paused");

export function syncPauseStatus({ flagPath = DEFAULT_FLAG_PATH } = {}) {
  return {
    paused: fs.existsSync(flagPath),
    flag_path: flagPath,
    message: fs.existsSync(flagPath)
      ? "同步暂停中：所有手动同步和历史同步执行入口都会被阻止。"
      : "同步未暂停。"
  };
}

export function setSyncPaused(paused, { flagPath = DEFAULT_FLAG_PATH } = {}) {
  fs.mkdirSync(path.dirname(flagPath), { recursive: true });
  if (paused) {
    fs.writeFileSync(flagPath, `paused_at=${new Date().toISOString()}\n`, "utf8");
  } else if (fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }
  return syncPauseStatus({ flagPath });
}

export function syncPauseGuard({ flagPath = DEFAULT_FLAG_PATH } = {}) {
  const status = syncPauseStatus({ flagPath });
  return status.paused
    ? { blocked: true, reason: status.message, status }
    : { blocked: false, reason: "", status };
}
