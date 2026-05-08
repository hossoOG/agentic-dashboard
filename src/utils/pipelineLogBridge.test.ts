import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLogViewerStore } from "../store/logViewerStore";
import { useSettingsStore } from "../store/settingsStore";

let capturedListener: ((event: unknown) => void) | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_eventName: string, cb: (event: unknown) => void) => {
    capturedListener = cb;
    return Promise.resolve(() => {});
  }),
}));

beforeEach(() => {
  capturedListener = null;
  useLogViewerStore.setState({
    entries: [],
    severityFilter: new Set(["error", "warn", "info"]),
    sourceFilter: new Set(["frontend", "backend", "pipeline"]),
    searchText: "",
    liveTail: true,
  });
});

describe("subscribeToPipelineLog gating", () => {
  it("pushes pipeline events into the store when frontendLogging is on", async () => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: true,
        backendFileLogging: false,
        performanceProfiler: false,
        showProtokolleTab: false,
        scrollbackLines: 25_000,
      },
    });

    const { subscribeToPipelineLog } = await import("./pipelineLogBridge");
    await subscribeToPipelineLog();

    capturedListener?.({
      payload: { line: "pipeline output", stream: "stdout" },
    });

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("pipeline");
    expect(entries[0].message).toBe("pipeline output");
  });

  it("drops pipeline events when frontendLogging is off", async () => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: false,
        backendFileLogging: false,
        performanceProfiler: false,
        showProtokolleTab: false,
        scrollbackLines: 25_000,
      },
    });

    const { subscribeToPipelineLog } = await import("./pipelineLogBridge");
    await subscribeToPipelineLog();

    capturedListener?.({
      payload: { line: "should not appear", stream: "stdout" },
    });

    expect(useLogViewerStore.getState().entries).toHaveLength(0);
  });

  it("respects severity mapping: stderr → warn, stdout → info", async () => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: true,
        backendFileLogging: false,
        performanceProfiler: false,
        showProtokolleTab: false,
        scrollbackLines: 25_000,
      },
    });

    const { subscribeToPipelineLog } = await import("./pipelineLogBridge");
    await subscribeToPipelineLog();

    capturedListener?.({ payload: { line: "stderr line", stream: "stderr" } });
    capturedListener?.({ payload: { line: "stdout line", stream: "stdout" } });

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(2);
    const stderrEntry = entries.find((e) => e.message === "stderr line");
    const stdoutEntry = entries.find((e) => e.message === "stdout line");
    expect(stderrEntry?.severity).toBe("warn");
    expect(stdoutEntry?.severity).toBe("info");
  });
});
