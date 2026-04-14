import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { KanbanBoard } from "./KanbanBoard";
import { invoke } from "@tauri-apps/api/core";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("../../utils/errorLogger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, exit: _e, transition: _t, ...rest } =
        props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock projectStore — gives controlled project selection without localStorage
vi.mock("../../store/projectStore", () => ({
  useProjectStore: vi.fn(),
}));

import { useProjectStore } from "../../store/projectStore";

// ── Test fixtures ─────────────────────────────────────────────────────

function makeBoard() {
  return {
    project_id: "PVT_abc123",
    status_field_id: "PVTSSF_field1",
    lanes: [
      { option_id: "opt_backlog", name: "Backlog", order: 0 },
      { option_id: "opt_ready", name: "Ready", order: 1 },
      { option_id: "opt_inprog", name: "In progress", order: 2 },
      { option_id: "opt_review", name: "In review", order: 3 },
      { option_id: "opt_done", name: "Done", order: 4 },
    ],
    items: [
      {
        item_id: "PVTI_1",
        issue_number: 1,
        title: "Backlog issue",
        assignee: "",
        labels: [],
        url: "https://github.com/org/repo/issues/1",
        state: "OPEN",
        current_lane_option_id: "opt_backlog",
      },
      {
        item_id: "PVTI_2",
        issue_number: 2,
        title: "Ready issue",
        assignee: "bob",
        labels: [{ name: "feature", color: "0075ca" }],
        url: "https://github.com/org/repo/issues/2",
        state: "OPEN",
        current_lane_option_id: "opt_ready",
      },
      {
        item_id: "PVTI_3",
        issue_number: 3,
        title: "In review issue",
        assignee: "alice",
        labels: [],
        url: "https://github.com/org/repo/issues/3",
        state: "OPEN",
        current_lane_option_id: "opt_review",
      },
      {
        item_id: "PVTI_4",
        issue_number: 4,
        title: "Done issue",
        assignee: "",
        labels: [],
        url: "https://github.com/org/repo/issues/4",
        state: "CLOSED",
        current_lane_option_id: "opt_done",
      },
      {
        item_id: "PVTI_5",
        issue_number: 5,
        title: "No status issue",
        assignee: "",
        labels: [],
        url: "https://github.com/org/repo/issues/5",
        state: "OPEN",
        current_lane_option_id: null,
      },
    ],
  };
}

// ── Store setup ───────────────────────────────────────────────────────

const mockSetFolderProject = vi.fn();
const mockSetGlobalProject = vi.fn();
const mockGetProjectForFolder = vi.fn();
const mockGetGlobalProject = vi.fn();
const mockInvoke = vi.mocked(invoke);

function setupStore(withProject = true) {
  vi.mocked(useProjectStore).mockReturnValue({
    projectByFolder: {},
    globalProject: null,
    setFolderProject: mockSetFolderProject,
    setGlobalProject: mockSetGlobalProject,
    getProjectForFolder: withProject
      ? mockGetProjectForFolder.mockReturnValue({
          projectNumber: 2,
          projectId: "PVT_abc123",
          title: "Agentic Dashboard",
        })
      : mockGetProjectForFolder.mockReturnValue(undefined),
    getGlobalProject: mockGetGlobalProject.mockReturnValue(undefined),
  } as ReturnType<typeof useProjectStore>);
}

function setupGlobalStore() {
  vi.mocked(useProjectStore).mockReturnValue({
    projectByFolder: {},
    globalProject: { projectNumber: 5, projectId: "PVT_g1", title: "Global Board" },
    setFolderProject: mockSetFolderProject,
    setGlobalProject: mockSetGlobalProject,
    getProjectForFolder: mockGetProjectForFolder.mockReturnValue(undefined),
    getGlobalProject: mockGetGlobalProject.mockReturnValue({
      projectNumber: 5,
      projectId: "PVT_g1",
      title: "Global Board",
    }),
  } as ReturnType<typeof useProjectStore>);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanBoard — Projects v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows loading state initially", () => {
    // Project already in store → only get_project_board is called; keep it pending.
    setupStore();
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<KanbanBoard folder="/test/loading" />);

    expect(screen.getByText("Lade Kanban-Daten...")).toBeTruthy();
  });

  it("renders dynamic lanes from GitHub Projects v2 Status field", async () => {
    // setupStore(true) → getProjectForFolder returns a project immediately,
    // so loadProjects is skipped and only get_project_board is called.
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    render(<KanbanBoard folder="/test/lanes" />);

    await waitFor(() => {
      // Lane names come from GitHub, not hardcoded strings
      expect(screen.getByText("Backlog")).toBeTruthy();
      expect(screen.getByText("Ready")).toBeTruthy();
      expect(screen.getByText("In progress")).toBeTruthy();
      expect(screen.getByText("In review")).toBeTruthy();
      expect(screen.getByText("Done")).toBeTruthy();
    });
  });

  it("renders items in their correct GitHub Projects lane", async () => {
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    render(<KanbanBoard folder="/test/items" />);

    await waitFor(() => {
      expect(screen.getByText("Backlog issue")).toBeTruthy();
      expect(screen.getByText("Ready issue")).toBeTruthy();
      expect(screen.getByText("In review issue")).toBeTruthy();
      expect(screen.getByText("Done issue")).toBeTruthy();
    });
  });

  it("renders 'Kein Status' column for items without a status set", async () => {
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    render(<KanbanBoard folder="/test/nostatus" />);

    await waitFor(() => {
      expect(screen.getByText("Kein Status")).toBeTruthy();
      expect(screen.getByText("No status issue")).toBeTruthy();
    });
  });

  it("data-lane-id uses Projects v2 option_id (not hardcoded slug)", async () => {
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    const { container } = render(<KanbanBoard folder="/test/laneids" />);

    await waitFor(() => {
      expect(screen.getByText("Backlog")).toBeTruthy();
    });

    const laneIds = Array.from(
      container.querySelectorAll("[data-lane-id]")
    ).map((el) => el.getAttribute("data-lane-id"));

    expect(laneIds).toContain("opt_backlog");
    expect(laneIds).toContain("opt_done");
    expect(laneIds).not.toContain("backlog");  // old hardcoded id must be gone
    expect(laneIds).not.toContain("in-progress");
  });

  it("shows error state on board load failure", async () => {
    setupStore();
    mockInvoke.mockRejectedValueOnce(new Error("Network error")); // get_project_board fails

    render(<KanbanBoard folder="/test/error" />);

    await waitFor(() => {
      expect(screen.getByText("Fehler beim Laden des Boards")).toBeTruthy();
    });

    expect(screen.getByText("Erneut versuchen")).toBeTruthy();
  });

  it("shows scope hint when error mentions 'project'", async () => {
    setupStore();
    mockInvoke.mockRejectedValueOnce(new Error("Missing project scope")); // get_project_board fails

    render(<KanbanBoard folder="/test/scope" />);

    await waitFor(() => {
      expect(
        screen.getByText(/gh auth refresh -s project/)
      ).toBeTruthy();
    });
  });

  it("shows project title in board header", async () => {
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    render(<KanbanBoard folder="/test/header" />);

    await waitFor(() => {
      expect(screen.getByText("Agentic Dashboard")).toBeTruthy();
    });
  });

  it("columns have no HTML5 DnD attributes", async () => {
    setupStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    const { container } = render(<KanbanBoard folder="/test/nodnd" />);

    await waitFor(() => {
      expect(screen.getByText("Backlog")).toBeTruthy();
    });

    const columns = container.querySelectorAll("[data-lane-id]");
    columns.forEach((col) => {
      expect(col.getAttribute("draggable")).toBeNull();
    });
  });

  it("global mode (folder=null) loads board and passes folder:null to backend", async () => {
    setupGlobalStore();
    mockInvoke.mockResolvedValueOnce(makeBoard()); // get_project_board

    render(<KanbanBoard folder={null} />);

    await waitFor(() => {
      expect(screen.getByText("Backlog")).toBeTruthy();
      expect(screen.getByText("Global Board")).toBeTruthy();
    });

    // Board was fetched with folder: null — backend uses temp_dir fallback.
    expect(mockInvoke).toHaveBeenCalledWith(
      "get_project_board",
      expect.objectContaining({ folder: null })
    );
  });
});
