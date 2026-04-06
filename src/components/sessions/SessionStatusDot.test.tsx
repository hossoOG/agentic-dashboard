import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SessionStatusDot } from "./SessionStatusDot";

describe("SessionStatusDot", () => {
  // ── Happy Path: each status renders correct color ──

  it("renders green pulse dot for running + active activity", () => {
    const { container } = render(
      <SessionStatusDot status="running" activityLevel="active" />,
    );
    const dot = container.querySelector(".bg-success.status-pulse-animation");
    expect(dot).toBeTruthy();
  });

  it("renders blue breathe dot for running + thinking activity", () => {
    const { container } = render(
      <SessionStatusDot status="running" activityLevel="thinking" />,
    );
    const dot = container.querySelector(".bg-info.status-breathe-animation");
    expect(dot).toBeTruthy();
  });

  it("renders neutral dot for running + idle activity", () => {
    const { container } = render(
      <SessionStatusDot status="running" activityLevel="idle" />,
    );
    const dot = container.querySelector(".bg-neutral-500");
    expect(dot).toBeTruthy();
    // No pulse or breathe animation for idle
    expect(container.querySelector(".status-pulse-animation")).toBeNull();
    expect(container.querySelector(".status-breathe-animation")).toBeNull();
  });

  it("renders warning pulse dot for waiting status", () => {
    const { container } = render(<SessionStatusDot status="waiting" />);
    const dot = container.querySelector(".bg-warning.status-pulse-animation");
    expect(dot).toBeTruthy();
  });

  it("renders green pulse dot for starting status (default active)", () => {
    const { container } = render(<SessionStatusDot status="starting" />);
    // No activityLevel → defaults to null → green pulse
    const dot = container.querySelector(".bg-success.status-pulse-animation");
    expect(dot).toBeTruthy();
  });

  it("renders neutral dot for done status without icons", () => {
    const { container } = render(<SessionStatusDot status="done" />);
    const dot = container.querySelector(".bg-neutral-500");
    expect(dot).toBeTruthy();
  });

  it("renders Check icon for done status with useIcons", () => {
    const { container } = render(<SessionStatusDot status="done" useIcons />);
    const checkIcon = container.querySelector("svg.text-success");
    expect(checkIcon).toBeTruthy();
  });

  it("renders error dot with bg-error for error status without icons", () => {
    const { container } = render(<SessionStatusDot status="error" />);
    const dot = container.querySelector(".bg-error");
    expect(dot).toBeTruthy();
  });

  it("renders AlertTriangle icon for error status with useIcons", () => {
    const { container } = render(<SessionStatusDot status="error" useIcons />);
    const alertIcon = container.querySelector("svg.text-error");
    expect(alertIcon).toBeTruthy();
  });

  // ── Edge Cases ──

  it("uses small size when size='sm'", () => {
    const { container } = render(
      <SessionStatusDot status="running" activityLevel="active" size="sm" />,
    );
    const dot = container.querySelector(".w-2.h-2");
    expect(dot).toBeTruthy();
  });

  it("renders green pulse for running without activityLevel (null)", () => {
    const { container } = render(<SessionStatusDot status="running" />);
    const dot = container.querySelector(".bg-success.status-pulse-animation");
    expect(dot).toBeTruthy();
  });
});
