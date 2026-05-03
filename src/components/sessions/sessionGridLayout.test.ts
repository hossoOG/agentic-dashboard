import { describe, it, expect } from "vitest";
import { GRID_AREAS, getGridStyle, SINGLE_LAYOUT_STYLE } from "./sessionGridLayout";

describe("sessionGridLayout", () => {
  it("exports GRID_AREAS in stable order a..d", () => {
    expect(GRID_AREAS).toEqual(["a", "b", "c", "d"]);
  });

  it("getGridStyle(1) returns single cell", () => {
    expect(getGridStyle(1).gridTemplate).toBe('"a" 1fr / 1fr');
  });

  it("getGridStyle(2) returns vertical 2-row layout", () => {
    expect(getGridStyle(2).gridTemplate).toBe('"a" 1fr "b" 1fr / 1fr');
  });

  it("getGridStyle(3) returns 2-over-1 layout", () => {
    expect(getGridStyle(3).gridTemplate).toBe('"a b" 1fr "c c" 1fr / 1fr 1fr');
  });

  it("getGridStyle(4) returns 2x2 layout", () => {
    expect(getGridStyle(4).gridTemplate).toBe('"a b" 1fr "c d" 1fr / 1fr 1fr');
  });

  it("getGridStyle(5+) falls back to 2x2 layout", () => {
    expect(getGridStyle(5).gridTemplate).toBe('"a b" 1fr "c d" 1fr / 1fr 1fr');
    expect(getGridStyle(42).gridTemplate).toBe('"a b" 1fr "c d" 1fr / 1fr 1fr');
  });

  it("SINGLE_LAYOUT_STYLE matches single-cell grid", () => {
    expect(SINGLE_LAYOUT_STYLE.gridTemplate).toBe('"a" 1fr / 1fr');
  });
});
