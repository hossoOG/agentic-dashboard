import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineHistoryView } from "./PipelineHistoryView";
import { usePipelineHistoryStore } from "../../store/pipelineHistoryStore";
import type { PipelineRun } from "../../types/pipelineHistory";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: `run-${Math.random().toString(36).slice(2, 8)}`,
    workflowName: "deploy-pipeline",
    startedAt: "2026-04-05T10:30:00Z",
    completedAt: "2026-04-05T10:32:34Z",
    outcome: "success",
    trigger: "manual",
    inputs: {},
    steps: [
      {
        stepId: "build",
        stepType: "action",
        startedAt: "2026-04-05T10:30:00Z",
        completedAt: "2026-04-05T10:31:00Z",
        outcome: "success",
        durationMs: 60000,
        retryCount: 0,
        outputSnippet: null,
        errorMessage: null,
      },
    ],
    totalDurationMs: 154000,
    totalTokens: null,
    projectPath: null,
    ...overrides,
  };
}

function resetStore(overrides: Partial<{ runs: PipelineRun[]; isLoading: boolean; selectedRunId: string | null }> = {}) {
  usePipelineHistoryStore.setState({
    runs: [],
    selectedRunId: null,
    isLoading: false,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
});

describe("PipelineHistoryView", () => {
  it("renders empty state when no runs exist", () => {
    render(<PipelineHistoryView />);
    expect(
      screen.getByText("Noch keine Pipeline-Runs vorhanden")
    ).toBeInTheDocument();
  });

  it("renders run list with mock data", () => {
    const run1 = makeRun({ id: "r1", workflowName: "build-pipeline" });
    const run2 = makeRun({
      id: "r2",
      workflowName: "test-pipeline",
      outcome: "failed",
    });
    resetStore({ runs: [run1, run2] });

    render(<PipelineHistoryView />);
    expect(screen.getByText("build-pipeline")).toBeInTheDocument();
    expect(screen.getByText("test-pipeline")).toBeInTheDocument();
  });

  it("shows status badges with correct labels", () => {
    const runs = [
      makeRun({ id: "r1", outcome: "success" }),
      makeRun({ id: "r2", outcome: "failed" }),
      makeRun({ id: "r3", outcome: "cancelled" }),
      makeRun({ id: "r4", outcome: "timed_out" }),
    ];
    resetStore({ runs });

    render(<PipelineHistoryView />);
    expect(screen.getByText("Erfolg")).toBeInTheDocument();
    expect(screen.getByText("Fehlgeschlagen")).toBeInTheDocument();
    expect(screen.getByText("Abgebrochen")).toBeInTheDocument();
    expect(screen.getByText("Timeout")).toBeInTheDocument();
  });

  it("formats duration correctly", () => {
    const run = makeRun({ id: "r1", totalDurationMs: 154000 });
    resetStore({ runs: [run] });

    render(<PipelineHistoryView />);
    expect(screen.getByText(/2:34/)).toBeInTheDocument();
  });

  it("click selects a run", () => {
    const run = makeRun({ id: "r1" });
    resetStore({ runs: [run] });

    render(<PipelineHistoryView />);
    fireEvent.click(screen.getByTestId("run-row-r1"));
    expect(usePipelineHistoryStore.getState().selectedRunId).toBe("r1");
  });

  it("refresh button triggers reload", () => {
    const loadRunsSpy = vi.fn();
    usePipelineHistoryStore.setState({ loadRuns: loadRunsSpy } as never);

    render(<PipelineHistoryView />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    expect(loadRunsSpy).toHaveBeenCalled();
  });
});
