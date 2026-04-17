import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpdateNotification } from "./UpdateNotification";
import type { UpdateState } from "../../hooks/useAutoUpdate";

function makeProps(overrides: Partial<UpdateState & {
  onUpdate?: () => void;
  onRelaunch?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}> = {}) {
  return {
    status: "idle" as UpdateState["status"],
    progress: 0,
    error: null as string | null,
    newVersion: null as string | null,
    lastChecked: null as Date | null,
    onUpdate: vi.fn(),
    onRelaunch: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("UpdateNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for idle status", () => {
    const { container } = render(<UpdateNotification {...makeProps({ status: "idle" })} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for checking status", () => {
    const { container } = render(<UpdateNotification {...makeProps({ status: "checking" })} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for upToDate status", () => {
    const { container } = render(<UpdateNotification {...makeProps({ status: "upToDate" })} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders available status with version and update button", () => {
    const onUpdate = vi.fn();
    render(
      <UpdateNotification
        {...makeProps({ status: "available", newVersion: "2.0.0", onUpdate })}
      />,
    );
    expect(screen.getByText(/v2\.0\.0 verf/)).toBeTruthy();
    expect(screen.getByText("Jetzt updaten")).toBeTruthy();

    fireEvent.click(screen.getByText("Jetzt updaten"));
    expect(onUpdate).toHaveBeenCalled();
  });

  it("renders dismiss button for available status", () => {
    const onDismiss = vi.fn();
    render(
      <UpdateNotification
        {...makeProps({ status: "available", newVersion: "2.0.0", onDismiss })}
      />,
    );
    // X button for dismiss
    const buttons = screen.getAllByRole("button");
    // Last button should be the dismiss (X) button
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders downloading status with progress bar", () => {
    render(
      <UpdateNotification {...makeProps({ status: "downloading", progress: 45 })} />,
    );
    expect(screen.getByText(/Lade Update.*45%/)).toBeTruthy();
  });

  it("renders ready status with relaunch button", () => {
    const onRelaunch = vi.fn();
    render(
      <UpdateNotification {...makeProps({ status: "ready", onRelaunch })} />,
    );
    expect(screen.getByText("Update bereit")).toBeTruthy();
    expect(screen.getByText("Jetzt neu starten")).toBeTruthy();

    fireEvent.click(screen.getByText("Jetzt neu starten"));
    expect(onRelaunch).toHaveBeenCalled();
  });

  it("renders error status with error message and retry button", () => {
    const onRetry = vi.fn();
    render(
      <UpdateNotification
        {...makeProps({ status: "error", error: "Network failure", onRetry })}
      />,
    );
    expect(screen.getByText(/Update-Fehler.*Network failure/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Erneut/));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders dismiss button for error status", () => {
    const onDismiss = vi.fn();
    render(
      <UpdateNotification
        {...makeProps({ status: "error", error: "fail", onDismiss })}
      />,
    );
    // Find the X dismiss button (last button)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("has correct border color for each status", () => {
    const { rerender } = render(
      <UpdateNotification {...makeProps({ status: "error", error: "x" })} />,
    );
    expect(screen.getByRole("status").className).toContain("border-red");

    rerender(<UpdateNotification {...makeProps({ status: "available", newVersion: "2.0" })} />);
    expect(screen.getByRole("status").className).toContain("border-accent");
  });
});
