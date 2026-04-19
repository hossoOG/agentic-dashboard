import { describe, it, expect } from "vitest";
import { ICONS, ICON_SIZE } from "./icons";

describe("ICONS registry", () => {
  it("exports stable nav keys", () => {
    expect(Object.keys(ICONS.nav).sort()).toEqual(
      ["editor", "kanban", "library", "logs", "sessions"],
    );
  });

  it("exports stable theme keys", () => {
    expect(Object.keys(ICONS.theme).sort()).toEqual(["dark", "light"]);
  });

  it("exports stable toast keys", () => {
    expect(Object.keys(ICONS.toast).sort()).toEqual(
      ["achievement", "error", "info", "ready", "success"],
    );
  });

  it("exports stable update keys", () => {
    expect(Object.keys(ICONS.update).sort()).toEqual(["available", "error"]);
  });

  it("exports stable action keys", () => {
    expect(Object.keys(ICONS.action).sort()).toEqual([
      "close",
      "collapse",
      "detach",
      "download",
      "externalLink",
      "folderOpen",
      "loading",
      "refresh",
      "retry",
      "scrollToBottom",
      "search",
      "terminal",
      "trash",
    ]);
  });

  it("exposes every nav icon as a callable component", () => {
    for (const Icon of Object.values(ICONS.nav)) {
      expect(typeof Icon).toBe("object"); // Lucide icons are forwardRef objects
      expect(Icon).toBeTruthy();
    }
  });

  it("includes the Pin icon at the top level", () => {
    expect(ICONS.pin).toBeTruthy();
  });
});

describe("ICON_SIZE tokens", () => {
  it("maps the four canonical sizes to Tailwind classes", () => {
    expect(ICON_SIZE.inline).toBe("w-3 h-3");
    expect(ICON_SIZE.card).toBe("w-3.5 h-3.5");
    expect(ICON_SIZE.nav).toBe("w-4 h-4");
    expect(ICON_SIZE.close).toBe("w-5 h-5");
  });

  it("exposes exactly four size keys (prevents silent expansion)", () => {
    expect(Object.keys(ICON_SIZE).sort()).toEqual(
      ["card", "close", "inline", "nav"],
    );
  });
});
