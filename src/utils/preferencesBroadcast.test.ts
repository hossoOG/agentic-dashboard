import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks must be set up before module-level imports of the test target
// because preferencesBroadcast does dynamic imports of @tauri-apps/api.

const emitMock = vi.fn((_event: string, _payload: unknown) => Promise.resolve());
let listenCallback: ((event: { payload: unknown }) => void) | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  emit: (event: string, payload: unknown) => emitMock(event, payload),
  listen: vi.fn((_eventName: string, cb: (event: { payload: unknown }) => void) => {
    listenCallback = cb;
    return Promise.resolve(() => {});
  }),
}));

const getCurrentWindowMock = vi.fn(() => ({ label: "main" }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => getCurrentWindowMock(),
}));

// Force the helper to take the Tauri branch (it checks
// "__TAURI_INTERNALS__" in window).
beforeEach(() => {
  emitMock.mockClear();
  listenCallback = null;
  getCurrentWindowMock.mockReturnValue({ label: "main" });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
  vi.resetModules();
});

describe("preferencesBroadcast", () => {
  it("broadcastPreferencesChange emits with sourceWindow label", async () => {
    const { broadcastPreferencesChange } = await import("./preferencesBroadcast");
    await broadcastPreferencesChange({ frontendLogging: true });
    expect(emitMock).toHaveBeenCalledWith("preferences-changed", {
      partial: { frontendLogging: true },
      sourceWindow: "main",
    });
  });

  it("listenForPreferencesChanges filters echoes from its own window", async () => {
    getCurrentWindowMock.mockReturnValue({ label: "main" });
    const { listenForPreferencesChanges } = await import("./preferencesBroadcast");
    const apply = vi.fn();
    await listenForPreferencesChanges(apply);

    // Echo from same window — must be ignored.
    listenCallback?.({
      payload: { partial: { frontendLogging: true }, sourceWindow: "main" },
    });

    expect(apply).not.toHaveBeenCalled();
  });

  it("listenForPreferencesChanges applies partials from other windows", async () => {
    getCurrentWindowMock.mockReturnValue({ label: "main" });
    const { listenForPreferencesChanges } = await import("./preferencesBroadcast");
    const apply = vi.fn();
    await listenForPreferencesChanges(apply);

    // Event from "log-viewer" — different window, must be applied.
    listenCallback?.({
      payload: { partial: { showProtokolleTab: true }, sourceWindow: "log-viewer" },
    });

    expect(apply).toHaveBeenCalledWith({ showProtokolleTab: true });
  });

  it("ignores malformed payloads", async () => {
    const { listenForPreferencesChanges } = await import("./preferencesBroadcast");
    const apply = vi.fn();
    await listenForPreferencesChanges(apply);

    listenCallback?.({ payload: undefined });

    expect(apply).not.toHaveBeenCalled();
  });
});
