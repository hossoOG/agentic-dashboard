import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineControls } from "./PipelineControls";
import { usePipelineStatusStore } from "../../store/pipelineStatusStore";
import type { PipelineStatusInfo } from "../../protocols/schema";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInvoke = vi.fn<any>(() => Promise.resolve(null));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(
  overrides: Partial<PipelineStatusInfo> = {},
): PipelineStatusInfo {
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

const MOCK_WORKFLOWS = [
  {
    name: "deploy-app",
    description: "Deploy the application",
    file_path: "/workflows/deploy.yml",
  },
  {
    name: "run-tests",
    description: "Run test suite",
    file_path: "/workflows/tests.yml",
  },
];

const MOCK_DEFINITION = {
  name: "deploy-app",
  description: "Deploy the application",
  version: 1,
  inputs: [
    {
      name: "environment",
      type: "select" as const,
      required: true,
      default: null,
      description: "Target environment",
      options: ["staging", "production"],
    },
    {
      name: "dry_run",
      type: "boolean" as const,
      required: false,
      default: "true",
      description: null,
      options: [],
    },
    {
      name: "version",
      type: "string" as const,
      required: true,
      default: null,
      description: "Version to deploy",
      options: [],
    },
  ],
  steps: [],
  metadata: { author: null, tags: [], estimated_duration_mins: null },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockInvoke.mockReset();
  setStatus({ status: "idle" });

  // Default: list_workflows returns MOCK_WORKFLOWS, load_workflow returns MOCK_DEFINITION
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockInvoke.mockImplementation(async (cmd: any) => {
    if (cmd === "list_workflows") return MOCK_WORKFLOWS;
    if (cmd === "load_workflow") return MOCK_DEFINITION;
    if (cmd === "run_workflow") return { success: true };
    if (cmd === "stop_pipeline") return null;
    return null;
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineControls", () => {
  it("renders workflow picker with available workflows", async () => {
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("deploy-app")).toBeInTheDocument();
    });
    expect(screen.getByText("run-tests")).toBeInTheDocument();
  });

  it("renders start button enabled when idle", async () => {
    setStatus({ status: "idle" });
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("deploy-app")).toBeInTheDocument();
    });

    const startBtn = screen.getByRole("button", { name: /Pipeline starten/ });
    expect(startBtn).not.toBeDisabled();
  });

  it("renders stop button disabled when idle", async () => {
    setStatus({ status: "idle" });
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("deploy-app")).toBeInTheDocument();
    });

    const stopBtn = screen.getByRole("button", { name: /Pipeline stoppen/ });
    expect(stopBtn).toBeDisabled();
  });

  it("disables start button when pipeline is running", async () => {
    setStatus({ status: "running" });
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("deploy-app")).toBeInTheDocument();
    });

    const startBtn = screen.getByRole("button", { name: /Pipeline starten/ });
    expect(startBtn).toBeDisabled();
  });

  it("enables stop button when pipeline is running", async () => {
    setStatus({ status: "running" });
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("deploy-app")).toBeInTheDocument();
    });

    const stopBtn = screen.getByRole("button", { name: /Pipeline stoppen/ });
    expect(stopBtn).not.toBeDisabled();
  });

  it("renders input fields for selected workflow", async () => {
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      // The select input for "environment"
      expect(screen.getByText("environment")).toBeInTheDocument();
    });

    // Boolean checkbox for dry_run
    expect(screen.getByText("dry_run")).toBeInTheDocument();
    // String input for version
    expect(screen.getByText("version")).toBeInTheDocument();
  });

  it("shows validation error for empty required fields on start", async () => {
    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("environment")).toBeInTheDocument();
    });

    // Click start without filling required fields
    const startBtn = screen.getByRole("button", { name: /Pipeline starten/ });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Pflichtfeld.*ist leer/),
      ).toBeInTheDocument();
    });
  });

  it("renders empty state when no workflows found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockInvoke.mockImplementation(async (cmd: any) => {
      if (cmd === "list_workflows") return [];
      return null;
    });

    render(<PipelineControls projectPath="/tmp/project" />);

    await waitFor(() => {
      expect(screen.getByText("Keine Workflows gefunden")).toBeInTheDocument();
    });
  });
});
