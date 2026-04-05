import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Toast } from "./Toast";
import { ToastContainer } from "./ToastContainer";
import { useUIStore } from "../../store/uiStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }: { children?: React.ReactNode }) => {
          const filteredProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            // Drop framer-motion-only props that React complains about
            if (
              ![
                "layout",
                "initial",
                "animate",
                "exit",
                "transition",
                "whileHover",
                "whileTap",
              ].includes(k)
            ) {
              filteredProps[k] = v;
            }
          }
          return <div {...filteredProps}>{children}</div>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ toasts: [] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders title and message for success toast", () => {
    render(
      <Toast
        toast={{
          id: "t1",
          type: "success",
          title: "Gespeichert",
          message: "Datei wurde erfolgreich gespeichert",
        }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Gespeichert")).toBeTruthy();
    expect(screen.getByText("Datei wurde erfolgreich gespeichert")).toBeTruthy();
  });

  it("auto-dismisses after default 5000ms", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: "t1", type: "info", title: "Hi" }}
        onDismiss={onDismiss}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });

  it("does not auto-dismiss when duration is 0", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: "t1", type: "info", title: "Persistent", duration: 0 }}
        onDismiss={onDismiss}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("calls onDismiss when close button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ id: "t1", type: "error", title: "Oops" }}
        onDismiss={onDismiss}
      />,
    );
    // Close button = the button containing the X icon (no aria-label in source)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onDismiss).toHaveBeenCalledWith("t1");
  });

  it("ToastContainer renders only last 5 toasts from uiStore", () => {
    useUIStore.setState({
      toasts: [
        { id: "1", type: "info", title: "T1", duration: 0 },
        { id: "2", type: "info", title: "T2", duration: 0 },
        { id: "3", type: "info", title: "T3", duration: 0 },
        { id: "4", type: "info", title: "T4", duration: 0 },
        { id: "5", type: "info", title: "T5", duration: 0 },
        { id: "6", type: "info", title: "T6", duration: 0 },
        { id: "7", type: "info", title: "T7", duration: 0 },
      ],
    });
    render(<ToastContainer />);
    // First two should be clipped (slice(-5)) → T3..T7 visible
    expect(screen.queryByText("T1")).toBeNull();
    expect(screen.queryByText("T2")).toBeNull();
    expect(screen.getByText("T3")).toBeTruthy();
    expect(screen.getByText("T4")).toBeTruthy();
    expect(screen.getByText("T5")).toBeTruthy();
    expect(screen.getByText("T6")).toBeTruthy();
    expect(screen.getByText("T7")).toBeTruthy();
  });

  it("ToastContainer subscribes to store updates (adding toast appears)", () => {
    render(<ToastContainer />);
    expect(screen.queryByText("Hello")).toBeNull();
    act(() => {
      useUIStore.getState().addToast({
        type: "success",
        title: "Hello",
        duration: 0,
      });
    });
    expect(screen.getByText("Hello")).toBeTruthy();
  });
});
