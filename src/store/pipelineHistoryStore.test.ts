import { describe, it, expect, beforeEach } from "vitest";
import { usePipelineHistoryStore } from "./pipelineHistoryStore";
import type { PipelineRun } from "../types/pipelineHistory";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: `run-${Math.random().toString(36).slice(2, 8)}`,
    workflowName: "test-workflow",
    startedAt: new Date().toISOString(),
    completedAt: null,
    outcome: "success",
    trigger: "manual",
    inputs: {},
    steps: [],
    totalDurationMs: 0,
    totalTokens: null,
    projectPath: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePipelineHistoryStore.setState({
    runs: [],
    selectedRunId: null,
    isLoading: false,
  });
});

describe("pipelineHistoryStore", () => {
  it("has correct initial state", () => {
    const state = usePipelineHistoryStore.getState();
    expect(state.runs).toEqual([]);
    expect(state.selectedRunId).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("selectRun sets selectedRunId", () => {
    usePipelineHistoryStore.getState().selectRun("run-123");
    expect(usePipelineHistoryStore.getState().selectedRunId).toBe("run-123");
  });

  it("clearSelection resets selectedRunId", () => {
    usePipelineHistoryStore.setState({ selectedRunId: "run-123" });
    usePipelineHistoryStore.getState().clearSelection();
    expect(usePipelineHistoryStore.getState().selectedRunId).toBeNull();
  });

  it("runs can be set and retrieved", () => {
    const runs = [makeRun({ id: "a" }), makeRun({ id: "b" })];
    usePipelineHistoryStore.setState({ runs });
    const state = usePipelineHistoryStore.getState();
    expect(state.runs).toHaveLength(2);
    expect(state.runs[0].id).toBe("a");
    expect(state.runs[1].id).toBe("b");
  });

  it("selectRun with null deselects", () => {
    usePipelineHistoryStore.setState({ selectedRunId: "run-123" });
    usePipelineHistoryStore.getState().selectRun(null);
    expect(usePipelineHistoryStore.getState().selectedRunId).toBeNull();
  });
});
