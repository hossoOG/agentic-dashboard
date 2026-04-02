import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PipelineView } from "./PipelineView";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { useAgentStore } from "../../store/agentStore";
import type { DetectedAgent } from "../../store/agentStore";

// ---------------------------------------------------------------------------
// Mocks — Tauri APIs are not available in test environment
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

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "sess-1",
    parentAgentId: null,
    name: "test-agent",
    task: "Implement feature",
    status: "running",
    detectedAt: Date.now() - 60_000,
    completedAt: null,
    worktreePath: null,
    ...overrides,
  };
}

beforeEach(() => {
  // Reset agent store to clean state
  useAgentStore.setState({
    agents: {},
    worktrees: {},
    selectedAgentId: null,
    bottomPanelCollapsed: true,
  });
});

// ============================================================================
// PipelineView — Smoke Tests
// ============================================================================

describe("PipelineView", () => {
  it("renders without crashing", () => {
    const { container } = render(<PipelineView />);
    expect(container).toBeTruthy();
  });

  it("shows WorkflowLauncher empty state when no session is active", () => {
    render(<PipelineView />);
    expect(
      screen.getByText(/Waehle ein Projekt um Workflows zu erkennen/)
    ).toBeInTheDocument();
  });

  it("shows AgentMetricsPanel empty state when no agents exist", () => {
    render(<PipelineView />);
    expect(
      screen.getByText(/Keine Agent-Metriken verfuegbar/)
    ).toBeInTheDocument();
  });
});

// ============================================================================
// AgentMetricsPanel — Smoke Tests
// ============================================================================

describe("AgentMetricsPanel", () => {
  it("renders empty state when no agents exist", () => {
    render(<AgentMetricsPanel />);
    expect(
      screen.getByText(/Keine Agent-Metriken verfuegbar/)
    ).toBeInTheDocument();
  });

  it("renders metric cards when agents exist", () => {
    const agent = makeAgent({ id: "a1", status: "running" });
    const completedAgent = makeAgent({
      id: "a2",
      status: "completed",
      completedAt: Date.now(),
    });

    useAgentStore.setState({
      agents: { a1: agent, a2: completedAgent },
      worktrees: {},
      selectedAgentId: null,
      bottomPanelCollapsed: true,
    });

    render(<AgentMetricsPanel />);

    // Should show the metrics header
    expect(screen.getByText("Agent-Metriken")).toBeInTheDocument();

    // Should show total count of 2
    expect(screen.getByText("Gesamt")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Should show active/completed labels
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText("Fertig")).toBeInTheDocument();
  });

  it("shows worktree usage bar when worktrees are detected", () => {
    const agent = makeAgent({
      id: "a1",
      status: "running",
      worktreePath: "/tmp/wt-1",
    });

    useAgentStore.setState({
      agents: { a1: agent },
      worktrees: {
        "/tmp/wt-1": {
          path: "/tmp/wt-1",
          branch: "feat/test",
          agentId: "a1",
          sessionId: "sess-1",
          active: true,
        },
      },
      selectedAgentId: null,
      bottomPanelCollapsed: true,
    });

    render(<AgentMetricsPanel />);
    expect(screen.getByText(/Worktree-Nutzung/)).toBeInTheDocument();
  });
});
