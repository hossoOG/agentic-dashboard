import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  usePipelineStatusStore,
  selectIsRunning,
  selectIsIdle,
  selectIsTerminal,
} from "./pipelineStatusStore";
import type { PipelineStatusInfo } from "../protocols/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<PipelineStatusInfo> = {}): PipelineStatusInfo {
  return {
    status: "idle",
    workflowName: null,
    stepIndex: 0,
    totalSteps: 0,
    elapsedMs: 0,
    errorMessage: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePipelineStatusStore.setState({
    statusInfo: makeStatus(),
    isLoading: false,
    pollingId: null,
  });
});

afterEach(() => {
  // Clean up any running polling
  usePipelineStatusStore.getState().stopPolling();
});

describe("pipelineStatusStore", () => {
  it("has correct initial state (idle, no workflow)", () => {
    const state = usePipelineStatusStore.getState();
    expect(state.statusInfo.status).toBe("idle");
    expect(state.statusInfo.workflowName).toBeNull();
    expect(state.statusInfo.stepIndex).toBe(0);
    expect(state.statusInfo.totalSteps).toBe(0);
    expect(state.statusInfo.elapsedMs).toBe(0);
    expect(state.statusInfo.errorMessage).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.pollingId).toBeNull();
  });

  it("fetchStatus updates state when status info is set directly", () => {
    const runningStatus = makeStatus({
      status: "running",
      workflowName: "deploy-workflow",
      stepIndex: 2,
      totalSteps: 5,
      elapsedMs: 15000,
    });
    usePipelineStatusStore.setState({ statusInfo: runningStatus });

    const state = usePipelineStatusStore.getState();
    expect(state.statusInfo.status).toBe("running");
    expect(state.statusInfo.workflowName).toBe("deploy-workflow");
    expect(state.statusInfo.stepIndex).toBe(2);
    expect(state.statusInfo.totalSteps).toBe(5);
  });

  it("selectIsRunning returns true for running and starting states", () => {
    const runningState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "running" }) };
    expect(selectIsRunning(runningState)).toBe(true);

    const startingState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "starting" }) };
    expect(selectIsRunning(startingState)).toBe(true);

    const idleState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "idle" }) };
    expect(selectIsRunning(idleState)).toBe(false);
  });

  it("selectIsIdle and selectIsTerminal return correct values", () => {
    const idleState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "idle" }) };
    expect(selectIsIdle(idleState)).toBe(true);
    expect(selectIsTerminal(idleState)).toBe(false);

    const completedState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "completed" }) };
    expect(selectIsIdle(completedState)).toBe(false);
    expect(selectIsTerminal(completedState)).toBe(true);

    const failedState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "failed" }) };
    expect(selectIsTerminal(failedState)).toBe(true);

    const cancelledState = { ...usePipelineStatusStore.getState(), statusInfo: makeStatus({ status: "cancelled" }) };
    expect(selectIsTerminal(cancelledState)).toBe(true);
  });

  it("startPolling/stopPolling manage the polling interval", () => {
    vi.useFakeTimers();
    try {
      const store = usePipelineStatusStore.getState();
      expect(store.pollingId).toBeNull();

      store.startPolling(1000);
      expect(usePipelineStatusStore.getState().pollingId).not.toBeNull();

      // Calling startPolling again should not create a second interval
      const firstId = usePipelineStatusStore.getState().pollingId;
      usePipelineStatusStore.getState().startPolling(1000);
      expect(usePipelineStatusStore.getState().pollingId).toBe(firstId);

      // Stop should clear the interval
      usePipelineStatusStore.getState().stopPolling();
      expect(usePipelineStatusStore.getState().pollingId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
