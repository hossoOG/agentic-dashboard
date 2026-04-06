import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";
import { Plus } from "lucide-react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Klick mich</Button>);
    expect(screen.getByRole("button", { name: "Klick mich" })).toBeTruthy();
  });

  it("calls onClick handler", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Test</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading", () => {
    render(<Button loading>Laden</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows spinner when loading", () => {
    const { container } = render(<Button loading>Laden</Button>);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders icon when provided", () => {
    render(<Button icon={<Plus data-testid="icon" />}>Mit Icon</Button>);
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("does not show icon when loading (spinner replaces it)", () => {
    render(
      <Button loading icon={<Plus data-testid="icon" />}>
        Laden
      </Button>,
    );
    expect(screen.queryByTestId("icon")).toBeNull();
  });

  it("applies primary variant classes", () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-neon-green");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-red-500");
  });

  it("applies size classes", () => {
    render(<Button size="sm">Klein</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("py-1.5");
  });

  it("merges custom className", () => {
    render(<Button className="my-custom">Custom</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-custom");
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
