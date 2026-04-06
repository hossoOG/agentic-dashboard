import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders button text and description", () => {
    render(<EmptyState onNewSession={vi.fn()} />);

    expect(screen.getByText("NEUE SESSION STARTEN")).toBeTruthy();
    expect(screen.getByText(/Waehle einen Ordner/)).toBeTruthy();
  });

  it("calls onNewSession when button is clicked", () => {
    const onNewSession = vi.fn();
    render(<EmptyState onNewSession={onNewSession} />);

    fireEvent.click(screen.getByText("NEUE SESSION STARTEN"));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });
});
