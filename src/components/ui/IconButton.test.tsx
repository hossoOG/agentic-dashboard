import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconButton } from "./IconButton";
import { X } from "lucide-react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("IconButton", () => {
  it("renders with aria-label", () => {
    render(<IconButton icon={<X />} label="Schliessen" />);
    expect(screen.getByRole("button", { name: "Schliessen" })).toBeTruthy();
  });

  it("renders with title attribute", () => {
    render(<IconButton icon={<X />} label="Schliessen" />);
    expect(screen.getByRole("button").getAttribute("title")).toBe("Schliessen");
  });

  it("calls onClick handler", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<X />} label="Close" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop set", () => {
    render(<IconButton icon={<X />} label="Close" disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies size classes", () => {
    render(<IconButton icon={<X />} label="Close" size="lg" />);
    expect(screen.getByRole("button").className).toContain("p-2");
  });

  it("merges custom className", () => {
    render(<IconButton icon={<X />} label="Close" className="extra" />);
    expect(screen.getByRole("button").className).toContain("extra");
  });
});
