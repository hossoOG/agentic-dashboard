import { describe, it, expect } from "vitest";
import {
  createADPMessage,
  isIdempotent,
  calculateRetryDelay,
  type ADPSource,
  type ADPRetryPolicy,
  type ADPEnvelope,
  type PipelineStartPayload,
} from "./schema";

// ============================================================================
// createADPMessage
// ============================================================================

describe("createADPMessage", () => {
  const source: ADPSource = { kind: "react-frontend" };
  const payload: PipelineStartPayload = {
    _type: "pipeline.start",
    projectPath: "/tmp/project",
    mode: "mock",
  };

  it("generates an envelope with version 1.0.0", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.version).toBe("1.0.0");
  });

  it("generates an id in UUID format", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(typeof msg.id).toBe("string");
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("generates a unique id for each call", () => {
    const a = createADPMessage("pipeline.start", source, payload);
    const b = createADPMessage("pipeline.start", source, payload);
    expect(a.id).not.toBe(b.id);
  });

  it("generates a valid ISO-8601 timestamp", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    const parsed = Date.parse(msg.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
    // ISO-8601 string round-trips through Date
    expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
  });

  it("sets the source correctly", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.source).toEqual({ kind: "react-frontend" });
  });

  it("embeds the payload correctly", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.payload).toEqual(payload);
    expect(msg.payload._type).toBe("pipeline.start");
  });

  it("sets meta with retryCount 0 and environment development by default", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.meta.retryCount).toBe(0);
    expect(msg.meta.environment).toBe("development");
  });

  it("sets target to null when not specified", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.target).toBeNull();
  });

  it("sets target when provided in options", () => {
    const msg = createADPMessage("pipeline.start", source, payload, {
      target: { kind: "tauri-backend" },
    });
    expect(msg.target).toEqual({ kind: "tauri-backend" });
  });

  it("sets correlationId and sequence from options", () => {
    const msg = createADPMessage("pipeline.start", source, payload, {
      correlationId: "corr-123",
      sequence: 5,
    });
    expect(msg.correlationId).toBe("corr-123");
    expect(msg.sequence).toBe(5);
  });

  it("defaults correlationId to null and sequence to 0", () => {
    const msg = createADPMessage("pipeline.start", source, payload);
    expect(msg.correlationId).toBeNull();
    expect(msg.sequence).toBe(0);
  });

  it("respects environment option", () => {
    const msg = createADPMessage("pipeline.start", source, payload, {
      environment: "production",
    });
    expect(msg.meta.environment).toBe("production");
  });
});

// ============================================================================
// isIdempotent
// ============================================================================

describe("isIdempotent", () => {
  // The module-level processedIds Set persists across tests within a module.
  // We create fresh envelopes with unique IDs per test to avoid cross-pollution.

  function makeEnvelope(id: string): ADPEnvelope {
    return {
      version: "1.0.0",
      id,
      timestamp: new Date().toISOString(),
      source: { kind: "react-frontend" },
      target: null,
      type: "system.heartbeat",
      correlationId: null,
      sequence: 0,
      payload: {
        _type: "system.heartbeat",
        uptimeSeconds: 0,
        memoryUsageMB: 0,
        activeConnections: 0,
      },
      meta: { retryCount: 0, environment: "development" },
    };
  }

  it("returns true for a new message", () => {
    const env = makeEnvelope(`new-${crypto.randomUUID()}`);
    expect(isIdempotent(env)).toBe(true);
  });

  it("returns false for a duplicate message (same ID)", () => {
    const id = `dup-${crypto.randomUUID()}`;
    const env = makeEnvelope(id);
    isIdempotent(env); // first call
    expect(isIdempotent(env)).toBe(false);
  });

  it("returns true for different IDs", () => {
    const a = makeEnvelope(`diff-a-${crypto.randomUUID()}`);
    const b = makeEnvelope(`diff-b-${crypto.randomUUID()}`);
    const c = makeEnvelope(`diff-c-${crypto.randomUUID()}`);
    expect(isIdempotent(a)).toBe(true);
    expect(isIdempotent(b)).toBe(true);
    expect(isIdempotent(c)).toBe(true);
  });

  it("performs LRU cleanup after exceeding 1000 entries", () => {
    // Insert 1001 unique messages to trigger cleanup
    const firstId = `lru-first-${crypto.randomUUID()}`;
    const firstEnv = makeEnvelope(firstId);
    isIdempotent(firstEnv);

    for (let i = 0; i < 1001; i++) {
      isIdempotent(makeEnvelope(`lru-fill-${i}-${crypto.randomUUID()}`));
    }

    // The first ID should have been evicted (cleanup removes oldest half)
    // So re-submitting it should return true (treated as new)
    expect(isIdempotent(firstEnv)).toBe(true);
  });
});

// ============================================================================
// calculateRetryDelay
// ============================================================================

describe("calculateRetryDelay", () => {
  it("returns baseDelayMs for fixed strategy regardless of retryCount", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 5,
      baseDelayMs: 500,
      maxDelayMs: 60000,
      strategy: "fixed",
    };
    expect(calculateRetryDelay(0, policy)).toBe(500);
    expect(calculateRetryDelay(1, policy)).toBe(500);
    expect(calculateRetryDelay(3, policy)).toBe(500);
  });

  it("returns baseDelayMs * 2^retryCount for exponential strategy", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 10,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      strategy: "exponential",
    };
    expect(calculateRetryDelay(0, policy)).toBe(1000); // 1000 * 2^0
    expect(calculateRetryDelay(1, policy)).toBe(2000); // 1000 * 2^1
    expect(calculateRetryDelay(2, policy)).toBe(4000); // 1000 * 2^2
    expect(calculateRetryDelay(3, policy)).toBe(8000); // 1000 * 2^3
  });

  it("returns a value between 50-100% of exponential for exponential-jitter strategy", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 10,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      strategy: "exponential-jitter",
    };

    // Run multiple times to check the range
    for (let i = 0; i < 50; i++) {
      const delay = calculateRetryDelay(2, policy);
      const baseExponential = 1000 * Math.pow(2, 2); // 4000
      expect(delay).toBeGreaterThanOrEqual(baseExponential * 0.5);
      expect(delay).toBeLessThanOrEqual(baseExponential);
    }
  });

  it("returns -1 when retryCount >= maxRetries", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      strategy: "exponential",
    };
    expect(calculateRetryDelay(3, policy)).toBe(-1);
    expect(calculateRetryDelay(4, policy)).toBe(-1);
    expect(calculateRetryDelay(100, policy)).toBe(-1);
  });

  it("caps the delay at maxDelayMs", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 20,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      strategy: "exponential",
    };
    // retryCount=10 → 1000 * 2^10 = 1024000, but capped at 5000
    expect(calculateRetryDelay(10, policy)).toBe(5000);
  });

  it("caps exponential-jitter delay at maxDelayMs", () => {
    const policy: ADPRetryPolicy = {
      maxRetries: 20,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      strategy: "exponential-jitter",
    };
    for (let i = 0; i < 20; i++) {
      const delay = calculateRetryDelay(10, policy);
      expect(delay).toBeLessThanOrEqual(3000);
    }
  });

  it("uses DEFAULT_RETRY_POLICY when no policy is provided", () => {
    // retryCount=0 with default policy (exponential-jitter, base=1000, max=30000, maxRetries=3)
    const delay = calculateRetryDelay(0);
    expect(delay).toBeGreaterThanOrEqual(500); // 1000 * 0.5
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("returns -1 when exceeding default maxRetries", () => {
    expect(calculateRetryDelay(3)).toBe(-1);
  });
});
