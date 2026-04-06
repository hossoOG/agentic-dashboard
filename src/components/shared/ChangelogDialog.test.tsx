import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChangelogDialog } from "./ChangelogDialog";

// Mock the raw changelog import
vi.mock("../../../CHANGELOG.md?raw", () => ({
  default: `# Changelog

## [1.5.0] — 2026-04-01

### Added
- **Feature A**: does something great
- Simple bullet point

### Fixed
- **Bug B**: fixed a crash

## [1.4.0] — 2026-03-15

### Changed
- Updated something

Some paragraph text here.
`,
}));

// Mock package.json version
vi.mock("../../../package.json", () => ({
  version: "1.5.0",
}));

// Mock build-time constants
// @ts-expect-error -- build-time global
globalThis.__BUILD_DATE__ = "2026-04-01";
// @ts-expect-error -- build-time global
globalThis.__GIT_HASH__ = "abc1234";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

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

describe("ChangelogDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ChangelogDialog open={false} onClose={vi.fn()} />,
    );
    // Modal with open=false should not render content
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders changelog sections when open", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("CHANGELOG")).toBeTruthy();
    // v1.5.0 appears both in header and section
    expect(screen.getAllByText(/v1\.5\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("v1.4.0")).toBeTruthy();
  });

  it("shows AKTUELL badge for current version", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("AKTUELL")).toBeTruthy();
  });

  it("renders version, git hash, and build date in header", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getAllByText(/v1\.5\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("abc1234")).toBeTruthy();
    // 2026-04-01 appears in header and as section date
    expect(screen.getAllByText("2026-04-01").length).toBeGreaterThanOrEqual(1);
  });

  it("renders bold items with highlighted text", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Feature A")).toBeTruthy();
    expect(screen.getByText(/does something great/)).toBeTruthy();
  });

  it("renders section headings (### Added, ### Fixed)", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("Fixed")).toBeTruthy();
  });

  it("renders plain bullet points", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Simple bullet point")).toBeTruthy();
  });

  it("renders paragraph text from changelog", () => {
    render(<ChangelogDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText("Some paragraph text here.")).toBeTruthy();
  });

  it("dims older versions (not current)", () => {
    const { container } = render(
      <ChangelogDialog open={true} onClose={vi.fn()} />,
    );
    // The v1.4.0 section should have opacity-60 class
    const sections = container.querySelectorAll(".opacity-60");
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });
});
