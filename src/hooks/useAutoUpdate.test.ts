import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoUpdate } from "./useAutoUpdate";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockCheck = vi.fn();
const mockRelaunch = vi.fn();
const mockGetVersion = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => mockRelaunch(...args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: (...args: unknown[]) => mockGetVersion(...args),
}));

// Ensure isTauri is false in test env (no __TAURI_INTERNALS__)
// so auto-check timers don't fire. We test manual calls instead.

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVersion.mockResolvedValue("1.0.0");
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("useAutoUpdate", () => {
  it("starts with idle status", () => {
    const { result } = renderHook(() => useAutoUpdate());

    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.newVersion).toBeNull();
    expect(result.current.lastChecked).toBeNull();
  });

  it("exposes checkForUpdate, downloadAndInstall, confirmRelaunch, dismiss", () => {
    const { result } = renderHook(() => useAutoUpdate());

    expect(typeof result.current.checkForUpdate).toBe("function");
    expect(typeof result.current.downloadAndInstall).toBe("function");
    expect(typeof result.current.confirmRelaunch).toBe("function");
    expect(typeof result.current.dismiss).toBe("function");
  });

  it("dismiss resets status to idle", async () => {
    const { result } = renderHook(() => useAutoUpdate());

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.status).toBe("idle");
  });

  it("downloadAndInstall does nothing when no update available", async () => {
    const { result } = renderHook(() => useAutoUpdate());

    await act(async () => {
      await result.current.downloadAndInstall();
    });

    // No update set → still idle
    expect(result.current.status).toBe("idle");
  });

  it("confirmRelaunch does nothing outside Tauri", async () => {
    const { result } = renderHook(() => useAutoUpdate());

    await act(async () => {
      await result.current.confirmRelaunch();
    });

    // relaunch not called — isTauri is false
    expect(mockRelaunch).not.toHaveBeenCalled();
  });
});
