import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewSessionDialog } from "./NewSessionDialog";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("NewSessionDialog", () => {
  it("renders nothing visible when open is false", () => {
    const { container } = render(
      <NewSessionDialog open={false} onClose={vi.fn()} />,
    );

    // Modal should not show content when closed
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders dialog content when open is true", () => {
    render(<NewSessionDialog open={true} onClose={vi.fn()} />);

    expect(screen.getByText("NEUE CLAUDE SESSION")).toBeTruthy();
    expect(screen.getByText("Wählen")).toBeTruthy();
    expect(screen.getByText("STARTEN")).toBeTruthy();
    expect(screen.getByText("Abbrechen")).toBeTruthy();
  });

  it("shows all three shell options", () => {
    render(<NewSessionDialog open={true} onClose={vi.fn()} />);

    expect(screen.getByText("PowerShell (Standard)")).toBeTruthy();
    expect(screen.getByText("CMD")).toBeTruthy();
    expect(screen.getByText("Git Bash")).toBeTruthy();
  });

  it("STARTEN button is disabled when no folder is selected", () => {
    render(<NewSessionDialog open={true} onClose={vi.fn()} />);

    const startBtn = screen.getByText("STARTEN").closest("button");
    expect(startBtn).toBeTruthy();
    expect(startBtn!.hasAttribute("disabled")).toBe(true);
  });

  it("calls onClose when Abbrechen is clicked", () => {
    const onClose = vi.fn();
    render(<NewSessionDialog open={true} onClose={onClose} />);

    fireEvent.click(screen.getByText("Abbrechen"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
