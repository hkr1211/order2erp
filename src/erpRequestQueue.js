export class ErpRequestQueue {
  constructor(options = {}) {
    this.minIntervalMs = parseNonNegativeInt(options.minIntervalMs, 800);
    this.circuitFailureThreshold = parseNonNegativeInt(options.circuitFailureThreshold, 3);
    this.circuitCooldownMs = parseNonNegativeInt(options.circuitCooldownMs, 300000);
    this.tail = Promise.resolve();
    this.lastStartedAt = 0;
    this.lastFinishedAt = 0;
    this.queued = 0;
    this.running = 0;
    this.completed = 0;
    this.failed = 0;
    this.lastError = "";
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  run(operation) {
    this.queued += 1;
    const scheduled = this.tail.then(async () => {
      this.queued = Math.max(0, this.queued - 1);
      this.assertCircuitClosed();
      await this.waitForInterval();
      this.lastStartedAt = Date.now();
      this.running += 1;
      try {
        const result = await operation();
        this.completed += 1;
        this.lastError = "";
        this.consecutiveFailures = 0;
        return result;
      } catch (error) {
        this.failed += 1;
        this.lastError = summarizeError(error);
        this.consecutiveFailures += 1;
        if (this.shouldOpenCircuit()) {
          this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
        }
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
      consecutive_failures: this.consecutiveFailures,
      circuit_state: this.isCircuitOpen() ? "open" : "closed",
      circuit_failure_threshold: this.circuitFailureThreshold,
      circuit_cooldown_ms: this.circuitCooldownMs,
      circuit_open_until: this.circuitOpenUntil ? new Date(this.circuitOpenUntil).toISOString() : "",
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

  assertCircuitClosed() {
    if (!this.isCircuitOpen()) {
      return;
    }
    throw new Error(`ERP保护模式熔断中，请等到 ${new Date(this.circuitOpenUntil).toISOString()} 后再试。`);
  }

  isCircuitOpen() {
    if (!this.circuitOpenUntil) {
      return false;
    }
    if (Date.now() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = 0;
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  shouldOpenCircuit() {
    return this.circuitFailureThreshold > 0 && this.consecutiveFailures >= this.circuitFailureThreshold;
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
