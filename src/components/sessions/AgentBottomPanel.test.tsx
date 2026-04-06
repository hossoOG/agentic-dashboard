import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentBottomPanel } from "./AgentBottomPanel";
import { useAgentStore } from "../../store/agentStore";
import type { DetectedAgent, DetectedWorktree } from "../../store/agentStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: "agent-1",
    sessionId: "session-1",
    parentAgentId: null,
    childrenIds: [],
    depth: 0,
    name: "architect",
    task: "Analyze issue",
    taskNumber: 1,
    phaseNumber: null,
    status: "running",
    detectedAt: Date.now() - 30_000,
    completedAt: null,
    worktreePath: null,
    durationStr: null,
    tokenCount: null,
    blockedBy: null,
    toolUses: null,
    ...overrides,
  };
}

function makeWorktree(overrides: Partial<DetectedWorktree> = {}): DetectedWorktree {
  return {
    path: "/proj/.claude/worktrees/fix-1",
    branch: "fix/issue-1",
    agentId: null,
    sessionId: "session-1",
    active: true,
    ...overrides,
  };
}

function resetAgentStore() {
  useAgentStore.setState({
    agents: {},
    worktrees: {},
    selectedAgentId: null,
    bottomPanelCollapsed: true,
    taskSummary: null,
    detectionQuality: {},
  });
}

beforeEach(() => {
  resetAgentStore();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("AgentBottomPanel", () => {
  it("returns null when no agents or worktrees exist", () => {
    const { container } = render(<AgentBottomPanel sessionId="session-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders summary strip with agent count", () => {
    const agent = makeAgent();
    useAgentStore.setState({
      agents: { [agent.id]: agent },
      bottomPanelCollapsed: true,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    expect(screen.getByText(/1 Agent/)).toBeTruthy();
    expect(screen.getByText(/(1 aktiv)/)).toBeTruthy();
  });

  it("renders plural 'Agenten' for multiple agents", () => {
    const agent1 = makeAgent({ id: "a-1", name: "architect" });
    const agent2 = makeAgent({
      id: "a-2",
      name: "test-engineer",
      status: "completed",
      completedAt: Date.now(),
    });

    useAgentStore.setState({
      agents: { [agent1.id]: agent1, [agent2.id]: agent2 },
      bottomPanelCollapsed: true,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    expect(screen.getByText(/2 Agenten/)).toBeTruthy();
    expect(screen.getByText(/(1 aktiv)/)).toBeTruthy();
  });

  it("shows worktree count in summary", () => {
    const agent = makeAgent();
    const wt = makeWorktree();

    useAgentStore.setState({
      agents: { [agent.id]: agent },
      worktrees: { [wt.path]: wt },
      bottomPanelCollapsed: true,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    expect(screen.getByText(/1 Worktrees/)).toBeTruthy();
  });

  it("toggles expanded content on summary click", () => {
    const agent = makeAgent();
    useAgentStore.setState({
      agents: { [agent.id]: agent },
      bottomPanelCollapsed: true,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    // Initially collapsed — no "Agenten" header in tree
    expect(screen.queryByText("Agent auswaehlen fuer Details")).toBeNull();

    // Click to expand
    fireEvent.click(screen.getByText(/1 Agent/));

    // Now panel is expanded — shows tree
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);
  });

  it("renders agent tree and detail when expanded with selected agent", () => {
    const agent = makeAgent({ task: "Build feature X" });

    useAgentStore.setState({
      agents: { [agent.id]: agent },
      bottomPanelCollapsed: false,
      selectedAgentId: agent.id,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    // Agent name in the tree
    expect(screen.getAllByText("architect").length).toBeGreaterThanOrEqual(1);
    // Detail card should show the task
    expect(screen.getByText("Build feature X")).toBeTruthy();
    // Detail card shows "Aktiv" label for running status
    expect(screen.getByText("Aktiv")).toBeTruthy();
  });

  it("shows placeholder text when no agent is selected in expanded view", () => {
    const agent = makeAgent();

    useAgentStore.setState({
      agents: { [agent.id]: agent },
      bottomPanelCollapsed: false,
      selectedAgentId: null,
    });

    render(<AgentBottomPanel sessionId="session-1" />);

    expect(screen.getByText("Agent auswaehlen fuer Details")).toBeTruthy();
  });
});
