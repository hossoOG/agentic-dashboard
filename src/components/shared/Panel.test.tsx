import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Panel } from "./Panel";
import { AlertCircle } from "lucide-react";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }: { children?: React.ReactNode }) => {
          const filtered: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (!["layout", "initial", "animate", "exit", "transition", "whileHover", "whileTap"].includes(k)) {
              filtered[k] = v;
            }
          }
          return <div {...filtered}>{children}</div>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe("Panel", () => {
  it("renders children in default expanded state", () => {
    render(<Panel>Hello Panel</Panel>);
    expect(screen.getByText("Hello Panel")).toBeTruthy();
  });

  it("renders title in uppercase", () => {
    render(<Panel title="my title">Content</Panel>);
    expect(screen.getByText("MY TITLE")).toBeTruthy();
  });

  it("renders icon when provided", () => {
    const { container } = render(
      <Panel title="Status" icon={AlertCircle}>
        Content
      </Panel>,
    );
    // Lucide icons render as SVGs
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("does not render header when no title and no icon", () => {
    const { container } = render(<Panel>Only content</Panel>);
    // No header border-b element
    const header = container.querySelector(".border-b");
    expect(header).toBeNull();
  });

  it("toggles collapsed state when collapsible header clicked", () => {
    render(
      <Panel title="Toggle" collapsible>
        Hidden Content
      </Panel>,
    );
    expect(screen.getByText("Hidden Content")).toBeTruthy();

    // Click header to collapse
    fireEvent.click(screen.getByText("TOGGLE"));
    expect(screen.queryByText("Hidden Content")).toBeNull();

    // Click again to expand
    fireEvent.click(screen.getByText("TOGGLE"));
    expect(screen.getByText("Hidden Content")).toBeTruthy();
  });

  it("starts collapsed when defaultCollapsed is true", () => {
    render(
      <Panel title="Collapsed" collapsible defaultCollapsed>
        Secret
      </Panel>,
    );
    expect(screen.queryByText("Secret")).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(
      <Panel className="custom-class">Content</Panel>,
    );
    expect(container.querySelector(".custom-class")).toBeTruthy();
  });

  it("applies neonColor styles", () => {
    const { container } = render(
      <Panel title="Error" neonColor="error">
        Content
      </Panel>,
    );
    expect(container.querySelector(".border-error")).toBeTruthy();
  });

  it("header is not clickable when not collapsible", () => {
    render(
      <Panel title="Static">Content</Panel>,
    );
    const header = screen.getByText("STATIC").closest("div");
    expect(header?.className).not.toContain("cursor-pointer");
  });
});
