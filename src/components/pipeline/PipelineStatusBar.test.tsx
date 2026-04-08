import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PipelineStatusBar } from "./PipelineStatusBar";
import { formatElapsed } from "../../utils/formatElapsed";
import { usePipelineStatusStore } from "../../store/pipelineStatusStore";
import type { PipelineStatusInfo } from "../../protocols/schema";

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

function setStatus(overrides: Partial<PipelineStatusInfo> = {}) {
  usePipelineStatusStore.setState({ statusInfo: makeStatus(overrides) });
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

describe("PipelineStatusBar", () => {
  it("renders idle state with 'Bereit' label", () => {
    setStatus({ status: "idle" });
    render(<PipelineStatusBar />);
    expect(screen.getByText("Bereit")).toBeInTheDocument();
  });

  it("renders running state with step progress", () => {
    setStatus({
      status: "running",
      workflowName: "deploy",
      stepIndex: 3,
      totalSteps: 7,
      elapsedMs: 5000,
    });
    render(<PipelineStatusBar />);
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText("deploy")).toBeInTheDocument();
    expect(screen.getByText("Schritt 3/7")).toBeInTheDocument();
  });

  it("renders failed state with error message", () => {
    setStatus({
      status: "failed",
      errorMessage: "Build fehlgeschlagen",
      elapsedMs: 12000,
    });
    render(<PipelineStatusBar />);
    expect(screen.getAllByText("Fehlgeschlagen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Build fehlgeschlagen/)).toBeInTheDocument();
  });

  it("renders elapsed time formatted correctly", () => {
    setStatus({ status: "running", elapsedMs: 154000 });
    render(<PipelineStatusBar />);
    expect(screen.getByText("Laufzeit 2m 34s")).toBeInTheDocument();
  });

  it("renders workflow name when present", () => {
    setStatus({
      status: "running",
      workflowName: "my-pipeline",
      stepIndex: 1,
      totalSteps: 3,
    });
    render(<PipelineStatusBar />);
    expect(screen.getByText("my-pipeline")).toBeInTheDocument();
  });
});

describe("formatElapsed", () => {
  it("formats sub-second as '< 1s'", () => {
    expect(formatElapsed(500)).toBe("< 1s");
  });

  it("formats seconds only", () => {
    expect(formatElapsed(45000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(154000)).toBe("2m 34s");
  });

  it("pads seconds with leading zero", () => {
    expect(formatElapsed(65000)).toBe("1m 05s");
  });
});
