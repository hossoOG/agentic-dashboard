import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }: { children?: React.ReactNode }) => {
          const filtered: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
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
              filtered[k] = v;
            }
          }
          return <div {...filtered}>{children}</div>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("Modal", () => {
  it("renders children when open", () => {
    render(
      <Modal open onClose={vi.fn()}>
        <p>Inhalt</p>
      </Modal>,
    );
    expect(screen.getByText("Inhalt")).toBeTruthy();
  });

  it("does not render children when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <p>Versteckt</p>
      </Modal>,
    );
    expect(screen.queryByText("Versteckt")).toBeNull();
  });

  it("renders title with close button when title is provided", () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title={<span>Mein Titel</span>}
      >
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText("Mein Titel")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Schliessen" }),
    ).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title={<span>Titel</span>}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Schliessen" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    // The outermost fixed div is the backdrop click target
    const backdrop = container.querySelector(".fixed.inset-0");
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside modal content", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Klick hier</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText("Klick hier"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has dialog role and aria-modal", () => {
    render(
      <Modal open onClose={vi.fn()}>
        <p>A11y</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("applies size classes", () => {
    render(
      <Modal open onClose={vi.fn()} size="lg">
        <p>Large</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-lg");
  });
});
