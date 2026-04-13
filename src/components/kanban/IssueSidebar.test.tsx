import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueSidebar } from "./IssueSidebar";
import type { KanbanLabel } from "./KanbanCard";

// ── Helpers ───────────────────────────────────────────────────────────

const formatDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("de-DE") : "";

const defaultLabels: KanbanLabel[] = [
  { name: "bug", color: "d73a4a" },
];

// ── Tests ─────────────────────────────────────────────────────────────

describe("IssueSidebar", () => {
  it("renders author", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("shows 'Niemand zugewiesen' when assignees is empty", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("Niemand zugewiesen")).toBeTruthy();
  });

  it("renders a single assignee", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={["bob"]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.queryByText("Niemand zugewiesen")).toBeNull();
  });

  it("renders all assignees when multiple are present", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={["bob", "carol", "dave"]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("bob")).toBeTruthy();
    expect(screen.getByText("carol")).toBeTruthy();
    expect(screen.getByText("dave")).toBeTruthy();
  });

  it("renders labels with names", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={defaultLabels}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("bug")).toBeTruthy();
  });

  it("hides labels section when labels is empty", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.queryByText("Labels")).toBeNull();
  });

  it("renders milestone when present", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone="v2.0"
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText("v2.0")).toBeTruthy();
  });

  it("hides milestone section when milestone is null", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.queryByText("Milestone")).toBeNull();
  });

  it("renders created date via formatDate", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    // formatDate renders as "15.03.2026" with de-DE locale
    expect(screen.getByText(/Erstellt:/)).toBeTruthy();
  });

  it("renders closed date when closedAt is set", () => {
    render(
      <IssueSidebar
        state="CLOSED"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-20T14:00:00Z"
        closedAt="2026-03-20T14:00:00Z"
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.getByText(/Geschlossen:/)).toBeTruthy();
  });

  it("hides closed date when closedAt is empty", () => {
    render(
      <IssueSidebar
        state="OPEN"
        author="alice"
        createdAt="2026-03-15T10:00:00Z"
        updatedAt="2026-03-15T10:00:00Z"
        closedAt=""
        assignees={[]}
        labels={[]}
        milestone={null}
        formatDate={formatDate}
      />,
    );

    expect(screen.queryByText(/Geschlossen:/)).toBeNull();
  });
});
