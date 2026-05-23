export class ErpRequestQueue {
  constructor(options = {}) {
    this.minIntervalMs = parseNonNegativeInt(options.minIntervalMs, 800);
    this.tail = Promise.resolve();
    this.lastStartedAt = 0;
  }

  run(operation) {
    const scheduled = this.tail.then(async () => {
      await this.waitForInterval();
      this.lastStartedAt = Date.now();
      return operation();
    });
    this.tail = scheduled.catch(() => {});
    return scheduled;
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
