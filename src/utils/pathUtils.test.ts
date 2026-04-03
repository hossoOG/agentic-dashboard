import { describe, it, expect } from "vitest";
import { shortenPath, folderLabel } from "./pathUtils";

describe("shortenPath", () => {
  it("returns as-is for 3 or fewer segments", () => {
    expect(shortenPath("a/b/c")).toBe("a/b/c");
  });

  it("returns as-is for a single segment", () => {
    expect(shortenPath("project")).toBe("project");
  });

  it("shortens paths with more than 3 segments", () => {
    expect(shortenPath("home/user/projects/myapp")).toBe("~/projects/myapp");
  });

  it("preserves original path for <=3 segments with backslashes", () => {
    expect(shortenPath("C:\\Users\\dev")).toBe("C:\\Users\\dev");
  });

  it("handles mixed separators and shortens", () => {
    expect(shortenPath("C:\\Users/projects\\myapp")).toBe("~/projects/myapp");
  });

  it("returns empty string for empty input", () => {
    expect(shortenPath("")).toBe("");
  });
});

describe("folderLabel", () => {
  it("returns the last segment with forward slashes", () => {
    expect(folderLabel("home/user/projects")).toBe("projects");
  });

  it("returns the last segment with backslashes", () => {
    expect(folderLabel("C:\\Users\\myapp")).toBe("myapp");
  });

  it("returns the path itself when no separators", () => {
    expect(folderLabel("myproject")).toBe("myproject");
  });
});
