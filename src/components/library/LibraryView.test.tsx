import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LibraryView } from "./LibraryView";
import { useConfigDiscoveryStore } from "../../store/configDiscoveryStore";
import type { ScopeConfig } from "../../store/configDiscoveryStore";
import { useSettingsStore } from "../../store/settingsStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      globalConfig: makeConfig({
        skills: [
          {
            name: "implement",
            dirName: "implement",
            description: "Issue to PR",
            args: [],
            hasReference: false,
            scope: "global",
            body: "# Implement Skill\nFull body content here.",
          },
        ],
      }),
    });

    render(<LibraryView />);
    expect(screen.getByText("Global (~/.claude/)")).toBeTruthy();
    expect(screen.getByText("implement")).toBeTruthy();
    expect(screen.getByText("Issue to PR")).toBeTruthy();
  });

  it("renders agents in global config", () => {
    useConfigDiscoveryStore.setState({
      globalConfig: makeConfig({
        agents: [
          { name: "architect", model: "opus", scope: "global" },
        ],
      }),
    });

    render(<LibraryView />);
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
    expect(screen.getByText(/My App/)).toBeTruthy();
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
});
