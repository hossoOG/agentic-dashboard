import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useUIStore } from "../store/uiStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./errorLogger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

// We need to import after mocks are set up
const { logError } = await import("./errorLogger");

describe("globalErrorHandler", () => {
  let errorListeners: ((event: ErrorEvent) => void)[];
  let rejectionListeners: ((event: unknown) => void)[];

  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ toasts: [] });
    errorListeners = [];
    rejectionListeners = [];

    // Capture event listeners added by installGlobalErrorHandlers
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === "error") {
          errorListeners.push(handler as (event: ErrorEvent) => void);
        } else if (type === "unhandledrejection") {
          rejectionListeners.push(handler as (event: unknown) => void);
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function install() {
    const mod = await import("./globalErrorHandler");
    mod.installGlobalErrorHandlers();
  }

  // jsdom does not have PromiseRejectionEvent — create a fake event shape
  function fakeRejectionEvent(reason: unknown) {
    return { reason } as unknown;
  }

  it("installs error and unhandledrejection listeners", async () => {
    await install();
    expect(errorListeners.length).toBe(1);
    expect(rejectionListeners.length).toBe(1);
  });

  it("handles window error event with Error object", async () => {
    await install();
    const error = new Error("Test error message");
    const event = new ErrorEvent("error", {
      error,
      message: "Test error message",
    });

    errorListeners[0](event);

    expect(logError).toHaveBeenCalledWith("window", error);
    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe("error");
    expect(toasts[0].message).toContain("Test error message");
  });

  it("handles window error event without Error object (fallback message)", async () => {
    await install();
    const event = new ErrorEvent("error", {
      message: "Script error",
    });

    errorListeners[0](event);

    expect(logError).toHaveBeenCalled();
    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toContain("Script error");
  });

  it("handles unhandled rejection with Error reason", async () => {
    await install();
    const reason = new Error("Promise failed");

    rejectionListeners[0](fakeRejectionEvent(reason));

    expect(logError).toHaveBeenCalledWith("promise", reason);
    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toContain("Promise failed");
  });

  it("handles unhandled rejection with string reason", async () => {
    await install();

    rejectionListeners[0](fakeRejectionEvent("string error reason"));

    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toContain("string error reason");
  });

  it("handles unhandled rejection with non-Error/non-string reason", async () => {
    await install();

    rejectionListeners[0](fakeRejectionEvent({ code: 42 }));

    const toasts = useUIStore.getState().toasts;
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe("Unbehandelte Promise-Rejection");
  });

  it("truncates long error messages to 120 chars", async () => {
    await install();
    const longMsg = "A".repeat(200);
    const event = new ErrorEvent("error", {
      error: new Error(longMsg),
      message: longMsg,
    });

    errorListeners[0](event);

    const toasts = useUIStore.getState().toasts;
    // 120 chars + ellipsis character
    expect(toasts[0].message?.length).toBeLessThanOrEqual(121);
  });
});
