import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DiffMergeView } from "./DiffMergeView";
import type { DiffFile } from "./types";

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: "src/foo.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    oldContent: "const a = 1;\n",
    newContent: "const a = 2;\n",
    oversize: false,
    ...overrides,
  };
}

describe("DiffMergeView", () => {
  it("renders the merge container with both contents for a normal file", async () => {
    const { getByTestId, container } = render(
      <DiffMergeView file={makeFile()} mode="side" />,
    );
    const mount = getByTestId("diff-merge-container");
    // CodeMirror builds its DOM inside the container — assert that *something*
    // landed there rather than asserting on internal class names that may
    // change between versions.
    await waitFor(() => {
      expect(mount.childElementCount).toBeGreaterThan(0);
    });
    // Header shows the path.
    expect(container.textContent).toContain("src/foo.ts");
  });

  it("renders an oversize banner instead of CodeMirror when oversize=true", async () => {
    const { getByTestId } = render(
      <DiffMergeView
        file={makeFile({ oversize: true, oldContent: undefined, newContent: undefined })}
        mode="side"
      />,
    );
    const mount = getByTestId("diff-merge-container");
    await waitFor(() => {
      expect(mount.textContent).toMatch(/Performance-Budget/);
    });
  });
});
