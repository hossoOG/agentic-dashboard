import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useLogViewerStore } from "../../store/logViewerStore";
import { LogViewer } from "./LogViewer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../utils/errorLogger", () => ({
  getRecentLogs: vi.fn(() => []),
  subscribeToLogs: vi.fn(() => () => {}),
  logError: vi.fn(),
}));

// Mock @tanstack/react-virtual — jsdom has no layout engine, so the virtualizer
// would render zero rows. This mock renders all items directly.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => HTMLElement | null;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: i * opts.estimateSize(),
        size: opts.estimateSize(),
        key: i,
      })),
    getTotalSize: () => opts.count * opts.estimateSize(),
    scrollToIndex: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useLogViewerStore.setState({
    entries: [],
    severityFilter: new Set(["error", "warn", "info"]),
    sourceFilter: new Set(["frontend", "backend", "pipeline"]),
    searchText: "",
    liveTail: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LogViewer", () => {
  it("renders empty state when no entries", () => {
    render(<LogViewer />);
    expect(screen.getByText("Keine Logs vorhanden")).toBeInTheDocument();
  });

  it("renders entries from store", () => {
    useLogViewerStore.getState().addEntries([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "error",
        source: "frontend",
        message: "Test error message",
      },
    ]);

    render(<LogViewer />);
    expect(screen.getByText("Test error message")).toBeInTheDocument();
  });

  it("does not duplicate entries on re-mount when store already has data", async () => {
    const { getRecentLogs } = await import("../../utils/errorLogger");
    const mockGetRecentLogs = vi.mocked(getRecentLogs);

    // Simulate first mount having loaded logs
    mockGetRecentLogs.mockReturnValue([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "info",
        source: "test",
        message: "existing log",
      },
    ]);

    // Pre-populate store (simulates logs already loaded on prior mount)
    useLogViewerStore.getState().addEntries([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "info",
        source: "frontend",
        module: "test",
        message: "existing log",
      },
    ]);

    const countBefore = useLogViewerStore.getState().entries.length;

    // Re-mount: should NOT add duplicates because store already has entries
    render(<LogViewer />);

    const countAfter = useLogViewerStore.getState().entries.length;
    expect(countAfter).toBe(countBefore);
  });

  it("displays entry count correctly", () => {
    useLogViewerStore.getState().addEntries([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "info",
        source: "frontend",
        message: "msg1",
      },
      {
        timestamp: "2025-01-15T10:30:01.000Z",
        severity: "error",
        source: "backend",
        message: "msg2",
      },
    ]);

    render(<LogViewer />);
    expect(screen.getByText(/2 Gruppen von 2 Einträgen/)).toBeInTheDocument();
  });

  it("filters entries by severity", () => {
    useLogViewerStore.getState().addEntries([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "error",
        source: "frontend",
        message: "error msg",
      },
      {
        timestamp: "2025-01-15T10:30:01.000Z",
        severity: "info",
        source: "frontend",
        message: "info msg",
      },
    ]);

    // Only show errors
    useLogViewerStore.setState({
      severityFilter: new Set(["error"]),
    });

    render(<LogViewer />);
    expect(screen.getByText("error msg")).toBeInTheDocument();
    expect(screen.queryByText("info msg")).not.toBeInTheDocument();
    expect(screen.getByText(/1 Gruppen von 2 Einträgen/)).toBeInTheDocument();
  });

  it("groups consecutive identical entries and shows count badge", () => {
    // Add 3 identical error entries
    useLogViewerStore.getState().addEntries([
      {
        timestamp: "2025-01-15T10:30:00.000Z",
        severity: "error",
        source: "frontend",
        message: "repeated error",
      },
      {
        timestamp: "2025-01-15T10:30:01.000Z",
        severity: "error",
        source: "frontend",
        message: "repeated error",
      },
      {
        timestamp: "2025-01-15T10:30:02.000Z",
        severity: "error",
        source: "frontend",
        message: "repeated error",
      },
    ]);

    render(<LogViewer />);
    // Should show 1 grouped row, not 3
    expect(screen.getByText(/1 Gruppen von 3 Einträgen/)).toBeInTheDocument();
    // The group count badge should show ×3
    expect(screen.getByText("×3")).toBeInTheDocument();
  });
});
