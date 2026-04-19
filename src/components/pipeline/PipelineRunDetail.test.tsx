import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PipelineRunDetail } from "./PipelineRunDetail";
import { usePipelineHistoryStore } from "../../store/pipelineHistoryStore";
import type { PipelineRun, StepRecord } from "../../types/pipelineHistory";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    stepId: "build",
    stepType: "action",
    startedAt: "2026-04-05T10:30:00Z",
    completedAt: "2026-04-05T10:31:00Z",
    outcome: "success",
    durationMs: 60000,
    retryCount: 0,
    outputSnippet: null,
    errorMessage: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "run-1",
    workflowName: "deploy-pipeline",
    startedAt: "2026-04-05T10:30:00Z",
    completedAt: "2026-04-05T10:32:34Z",
    outcome: "success",
    trigger: "manual",
    inputs: {},
    steps: [makeStep()],
    totalDurationMs: 154000,
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

describe("PipelineRunDetail", () => {
  it("renders run header with workflow name and status", () => {
    const run = makeRun({ workflowName: "my-workflow", outcome: "success" });
    render(<PipelineRunDetail run={run} />);

    expect(screen.getByText("my-workflow")).toBeInTheDocument();
    expect(screen.getAllByText("Erfolg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2:34/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders step timeline with step details", () => {
    const steps = [
      makeStep({ stepId: "lint", stepType: "gate", durationMs: 5000 }),
      makeStep({ stepId: "build", stepType: "action", durationMs: 60000 }),
      makeStep({ stepId: "deploy", stepType: "agent", durationMs: 30000 }),
    ];
    const run = makeRun({ steps });

    render(<PipelineRunDetail run={run} />);

    expect(screen.getByTestId("step-lint")).toBeInTheDocument();
    expect(screen.getByTestId("step-build")).toBeInTheDocument();
    expect(screen.getByTestId("step-deploy")).toBeInTheDocument();
    expect(screen.getByText("Gate")).toBeInTheDocument();
    expect(screen.getByText("Aktion")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("shows error messages for failed steps after expanding", () => {
    const steps = [
      makeStep({
        stepId: "test",
        outcome: "failed",
        errorMessage: "Tests failed: 3 errors",
      }),
    ];
    const run = makeRun({ steps, outcome: "failed" });

    render(<PipelineRunDetail run={run} />);

    // Click to expand the failed step
    const stepEl = screen.getByTestId("step-test");
    fireEvent.click(stepEl.querySelector("button")!);
    expect(screen.getByText(/Tests failed: 3 errors/)).toBeInTheDocument();
  });

  it("shows retry count when > 0", () => {
    const steps = [makeStep({ stepId: "flaky-step", retryCount: 3 })];
    const run = makeRun({ steps });

    render(<PipelineRunDetail run={run} />);
    expect(screen.getByTestId("retry-flaky-step")).toHaveTextContent("3x");
  });

  it("back button calls clearSelection", () => {
    const run = makeRun();
    const clearSelectionSpy = vi.fn();
    usePipelineHistoryStore.setState({
      clearSelection: clearSelectionSpy,
    } as never);

    render(<PipelineRunDetail run={run} />);
    fireEvent.click(screen.getByTestId("back-button"));
    expect(clearSelectionSpy).toHaveBeenCalled();
  });
});
