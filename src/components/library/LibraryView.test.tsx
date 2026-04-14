import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LibraryView } from "./LibraryView";

// Mock framer-motion to render synchronously (no exit-animation delays)
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
import { useConfigDiscoveryStore } from "../../store/configDiscoveryStore";
import type { ScopeConfig } from "../../store/configDiscoveryStore";
import { useSettingsStore } from "../../store/settingsStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vitest mock requires runtime cast; vi.MockedFunction<> would need extra setup
const mockUseSettingsStore = useSettingsStore as any;

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve("")),
}));

vi.mock("../../store/sessionStore", () => ({
  useSessionStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({ sessions: [], activeSessionId: null }),
  ),
  selectActiveSession: () => null,
}));

vi.mock("../../store/settingsStore", () => ({
  useSettingsStore: vi.fn((sel: CallableFunction) =>
    sel({ favorites: [] }),
  ),
}));

const makeConfig = (overrides?: Partial<ScopeConfig>): ScopeConfig => ({
  skills: [],
  agents: [],
  hooks: [],
  settingsRaw: "",
  claudeMd: "",
  memoryFiles: [],
  ...overrides,
});

const mockSkill = {
  name: "implement",
  dirName: "implement",
  description: "Issue to PR",
  args: [],
  hasReference: false,
  scope: "global" as const,
  body: "# Implement Skill\nFull body content here.",
};

beforeEach(() => {
  useConfigDiscoveryStore.setState({
    globalConfig: null,
    projectConfig: null,
    projectPath: null,
    favoriteConfigs: {},
    favoritesLoading: {},
    loading: false,
    error: null,
    contentCache: {},
    contentLoading: {},
    selectedDetail: null,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("LibraryView", () => {
  it("renders header with Library title", () => {
    render(<LibraryView />);
    expect(screen.getByText("Library")).toBeTruthy();
  });

  it("shows loading state when discovering", () => {
    useConfigDiscoveryStore.setState({ loading: true });
    render(<LibraryView />);
    expect(screen.getByText("Scanne Konfigurationen...")).toBeTruthy();
  });

  it("shows empty state when no configs found and not loading", () => {
    // Override discoverGlobal to not trigger loading
    useConfigDiscoveryStore.setState({
      loading: false,
      globalConfig: null,
      projectConfig: null,
    });
    // Replace discoverGlobal with a no-op to prevent useEffect from triggering loading
    const store = useConfigDiscoveryStore.getState();
    useConfigDiscoveryStore.setState({
      ...store,
      discoverGlobal: vi.fn(async () => {}),
      discoverProject: vi.fn(async () => {}),
    });
    render(<LibraryView />);
    expect(screen.getByText("Keine Konfigurationen gefunden")).toBeTruthy();
  });

  it("renders global scope panel with skills", () => {
    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig({ skills: [mockSkill] }),
    });

    render(<LibraryView />);
    const panelHeader = screen.getByText("Global (~/.claude/)");
    expect(panelHeader).toBeTruthy();
    // Panel starts collapsed — click to expand
    fireEvent.click(panelHeader.closest("button")!);
    expect(screen.getByText("implement")).toBeTruthy();
    expect(screen.getByText("Issue to PR")).toBeTruthy();
  });

  it("renders agents in global config", () => {
    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig({
        agents: [
          { name: "architect", model: "opus", description: "", scope: "global" },
        ],
      }),
    });

    render(<LibraryView />);
    const panelHeader = screen.getByText("Global (~/.claude/)");
    fireEvent.click(panelHeader.closest("button")!);
    expect(screen.getByText("architect")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
  });

  it("renders hooks in global config", () => {
    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig({
        hooks: [
          {
            event: "PreToolUse",
            matcher: "Bash",
            command: "node safe-guard.mjs",
            scope: "global",
            source: "settings.json",
          },
        ],
      }),
    });

    render(<LibraryView />);
    const panelHeader = screen.getByText("Global (~/.claude/)");
    fireEvent.click(panelHeader.closest("button")!);
    expect(screen.getByText("PreToolUse")).toBeTruthy();
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("node safe-guard.mjs")).toBeTruthy();
  });

  it("renders refresh button", () => {
    render(<LibraryView />);
    const refreshBtn = screen.getByTitle("Neu laden");
    expect(refreshBtn).toBeTruthy();
  });

  it("renders favorite project panels when favorites exist", () => {
    // Override settingsStore mock to return favorites
    mockUseSettingsStore.mockImplementation(
      (sel: CallableFunction) =>
        sel({
          favorites: [
            {
              id: "fav-1",
              path: "C:/Projects/my-app",
              label: "My App",
              shell: "powershell",
              addedAt: 1000,
              lastUsedAt: 2000,
            },
          ],
        }),
    );

    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig(),
      favoriteConfigs: {
        "C:/Projects/my-app": makeConfig({
          skills: [
            {
              name: "deploy",
              dirName: "deploy",
              description: "Deploy app",
              args: [],
              hasReference: false,
              scope: "project",
              body: "# Deploy\nDeploy instructions.",
            },
          ],
          claudeMd: "# My App Config",
        }),
      },
      discoverFavorites: vi.fn(async () => {}),
    });

    render(<LibraryView />);
    const panelHeader = screen.getByText(/My App/);
    expect(panelHeader).toBeTruthy();
    // Panel starts collapsed — click to expand
    fireEvent.click(panelHeader.closest("button")!);
    expect(screen.getByText("deploy")).toBeTruthy();
  });

  it("does not render favorite panel when config is not yet loaded", () => {
    mockUseSettingsStore.mockImplementation(
      (sel: CallableFunction) =>
        sel({
          favorites: [
            {
              id: "fav-2",
              path: "C:/Projects/other-app",
              label: "Other App",
              shell: "powershell",
              addedAt: 1000,
              lastUsedAt: 2000,
            },
          ],
        }),
    );

    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig(),
      favoriteConfigs: {}, // Config not loaded yet
      discoverFavorites: vi.fn(async () => {}),
    });

    render(<LibraryView />);
    // "Other App" should not appear since config is not loaded
    expect(screen.queryByText(/Other App/)).toBeNull();
  });

  // ── Modal Integration Tests ──────────────────────────────────────────

  it("opens detail modal when skill card is clicked", () => {
    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig({ skills: [mockSkill] }),
    });

    render(<LibraryView />);
    // Panel starts collapsed — expand first
    const panelHeader = screen.getByText("Global (~/.claude/)");
    fireEvent.click(panelHeader.closest("button")!);
    // skill name appears in the card button
    const skillButton = screen.getByRole("button", { name: /implement/i });
    fireEvent.click(skillButton);

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("detail modal closes when close button is clicked", async () => {
    // Open modal via store action directly
    useConfigDiscoveryStore.getState().openDetail({ category: "skills", item: mockSkill });

    render(<LibraryView />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    const closeBtn = screen.getByLabelText("Schliessen");
    fireEvent.click(closeBtn);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("detail modal shows skill name in header", () => {
    useConfigDiscoveryStore.getState().openDetail({ category: "skills", item: mockSkill });

    render(<LibraryView />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    // skill name appears in the modal header (in addition to card in background)
    const allImplementTexts = screen.getAllByText("implement");
    expect(allImplementTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("closes detail modal on Escape key", async () => {
    useConfigDiscoveryStore.getState().openDetail({ category: "skills", item: mockSkill });

    render(<LibraryView />);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
