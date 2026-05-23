export class ErpRequestQueue {
  constructor(options = {}) {
    this.minIntervalMs = parseNonNegativeInt(options.minIntervalMs, 800);
    this.tail = Promise.resolve();
    this.lastStartedAt = 0;
    this.lastFinishedAt = 0;
    this.queued = 0;
    this.running = 0;
    this.completed = 0;
    this.failed = 0;
    this.lastError = "";
  }

  run(operation) {
    this.queued += 1;
    const scheduled = this.tail.then(async () => {
      this.queued = Math.max(0, this.queued - 1);
      await this.waitForInterval();
      this.lastStartedAt = Date.now();
      this.running += 1;
      try {
        const result = await operation();
        this.completed += 1;
        this.lastError = "";
        return result;
      } catch (error) {
        this.failed += 1;
        this.lastError = summarizeError(error);
        throw error;
      } finally {
        this.running = Math.max(0, this.running - 1);
        this.lastFinishedAt = Date.now();
      }
    });
    this.tail = scheduled.catch(() => {});
    return scheduled;
  }

  snapshot() {
    return {
      queued: this.queued,
      running: this.running,
      completed: this.completed,
      failed: this.failed,
      min_interval_ms: this.minIntervalMs,
      last_started_at: this.lastStartedAt ? new Date(this.lastStartedAt).toISOString() : "",
      last_finished_at: this.lastFinishedAt ? new Date(this.lastFinishedAt).toISOString() : "",
      last_error: this.lastError
    };
  }

  async waitForInterval() {
    if (!this.lastStartedAt || this.minIntervalMs <= 0) {
      return;
    }
    const elapsed = Date.now() - this.lastStartedAt;
    const waitMs = this.minIntervalMs - elapsed;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function parseNonNegativeInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function summarizeError(error) {
  const message = error?.message || String(error);
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}
