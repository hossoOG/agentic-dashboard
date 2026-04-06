import { describe, it, expect } from "vitest";
import { getStatusStyle, STATUS_STYLES } from "./statusConfig";

describe("getStatusStyle", () => {
  it("returns active style for 'active'", () => {
    expect(getStatusStyle("active")).toBe(STATUS_STYLES.active);
  });

  it("returns error style for 'error'", () => {
    expect(getStatusStyle("error")).toBe(STATUS_STYLES.error);
  });

  it("returns done style for 'done'", () => {
    expect(getStatusStyle("done")).toBe(STATUS_STYLES.done);
  });

  it("returns idle style for unknown status", () => {
    expect(getStatusStyle("nonexistent")).toBe(STATUS_STYLES.idle);
  });
});
