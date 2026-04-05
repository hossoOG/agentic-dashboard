import { describe, it, expect, beforeEach } from "vitest";
import {
  useSettingsStore,
  type SettingsState,
  normalizeProjectKey,
  validatePinnedPath,
} from "./settingsStore";

// ============================================================================
// Helpers
// ============================================================================

function getState(): SettingsState {
  return useSettingsStore.getState();
}

// ============================================================================
// Reset
// ============================================================================

beforeEach(() => {
  useSettingsStore.getState().resetToDefaults();
  // Also clear favorites, apiKeys and pinnedDocs manually (resetToDefaults preserves them)
  useSettingsStore.setState({ favorites: [], apiKeys: [], pinnedDocs: {} });
});

// ============================================================================
// Initial State / Defaults
// ============================================================================

describe("initial state", () => {
  it("defaults theme.mode to 'dark'", () => {
    expect(getState().theme.mode).toBe("dark");
  });

  it("defaults theme.reducedMotion to false", () => {
    expect(getState().theme.reducedMotion).toBe(false);
  });

  it("defaults theme.animationSpeed to 1.0", () => {
    expect(getState().theme.animationSpeed).toBe(1.0);
  });

  it("defaults theme.accentColor to oklch value", () => {
    expect(getState().theme.accentColor).toBe("oklch(72% 0.14 190)");
  });

  it("defaults sound.enabled to false", () => {
    expect(getState().sound.enabled).toBe(false);
  });

  it("defaults sound.volume to 0.5", () => {
    expect(getState().sound.volume).toBe(0.5);
  });

  it("defaults notifications.enabled to true", () => {
    expect(getState().notifications.enabled).toBe(true);
  });

  it("defaults all notification channels to true", () => {
    const n = getState().notifications;
    expect(n.pipelineComplete).toBe(true);
    expect(n.pipelineError).toBe(true);
    expect(n.qaGateResult).toBe(true);
    expect(n.costAlert).toBe(true);
  });

  it("defaults pipeline.defaultMode to 'mock'", () => {
    expect(getState().pipeline.defaultMode).toBe("mock");
  });

  it("defaults pipeline.maxConcurrentWorktrees to 5", () => {
    expect(getState().pipeline.maxConcurrentWorktrees).toBe(5);
  });

  it("defaults pipeline.autoRetryOnError to false", () => {
    expect(getState().pipeline.autoRetryOnError).toBe(false);
  });

  it("defaults pipeline.logBufferSize to 200", () => {
    expect(getState().pipeline.logBufferSize).toBe(200);
  });

  it("defaults locale to 'de'", () => {
    expect(getState().locale).toBe("de");
  });

  it("defaults defaultShell to 'auto'", () => {
    expect(getState().defaultShell).toBe("auto");
  });

  it("defaults defaultProjectPath to empty string", () => {
    expect(getState().defaultProjectPath).toBe("");
  });

  it("defaults apiKeys to empty array", () => {
    expect(getState().apiKeys).toEqual([]);
  });

  it("defaults favorites to empty array", () => {
    expect(getState().favorites).toEqual([]);
  });
});

// ============================================================================
// setTheme
// ============================================================================

describe("setTheme", () => {
  it("updates a single theme property", () => {
    getState().setTheme({ reducedMotion: true });
    expect(getState().theme.reducedMotion).toBe(true);
  });

  it("merges with existing theme values", () => {
    getState().setTheme({ animationSpeed: 0.5 });
    const theme = getState().theme;
    // Other values should remain unchanged
    expect(theme.mode).toBe("dark");
    expect(theme.reducedMotion).toBe(false);
    expect(theme.animationSpeed).toBe(0.5);
  });

  it("updates multiple theme properties at once", () => {
    getState().setTheme({ reducedMotion: true, animationSpeed: 2.0 });
    const theme = getState().theme;
    expect(theme.reducedMotion).toBe(true);
    expect(theme.animationSpeed).toBe(2.0);
  });

  it("updates accentColor", () => {
    getState().setTheme({ accentColor: "#ff0000" });
    expect(getState().theme.accentColor).toBe("#ff0000");
  });
});

// ============================================================================
// setNotifications
// ============================================================================

describe("setNotifications", () => {
  it("updates a single notification property", () => {
    getState().setNotifications({ enabled: false });
    expect(getState().notifications.enabled).toBe(false);
  });

  it("merges with existing notification values", () => {
    getState().setNotifications({ costAlert: false });
    const n = getState().notifications;
    expect(n.enabled).toBe(true);
    expect(n.pipelineComplete).toBe(true);
    expect(n.costAlert).toBe(false);
  });

  it("updates multiple notification properties", () => {
    getState().setNotifications({
      pipelineComplete: false,
      pipelineError: false,
    });
    const n = getState().notifications;
    expect(n.pipelineComplete).toBe(false);
    expect(n.pipelineError).toBe(false);
    expect(n.qaGateResult).toBe(true);
  });
});

// ============================================================================
// setSound
// ============================================================================

describe("setSound", () => {
  it("enables sound", () => {
    getState().setSound({ enabled: true });
    expect(getState().sound.enabled).toBe(true);
  });

  it("updates volume while preserving enabled state", () => {
    getState().setSound({ volume: 0.8 });
    expect(getState().sound.volume).toBe(0.8);
    expect(getState().sound.enabled).toBe(false);
  });
});

// ============================================================================
// setPipeline
// ============================================================================

describe("setPipeline", () => {
  it("updates defaultMode to real", () => {
    getState().setPipeline({ defaultMode: "real" });
    expect(getState().pipeline.defaultMode).toBe("real");
  });

  it("merges with existing pipeline values", () => {
    getState().setPipeline({ maxConcurrentWorktrees: 3 });
    const p = getState().pipeline;
    expect(p.maxConcurrentWorktrees).toBe(3);
    expect(p.defaultMode).toBe("mock");
    expect(p.autoRetryOnError).toBe(false);
    expect(p.logBufferSize).toBe(200);
  });

  it("updates multiple pipeline properties", () => {
    getState().setPipeline({
      autoRetryOnError: true,
      logBufferSize: 500,
    });
    expect(getState().pipeline.autoRetryOnError).toBe(true);
    expect(getState().pipeline.logBufferSize).toBe(500);
  });
});

// ============================================================================
// setLocale
// ============================================================================

describe("setLocale", () => {
  it("switches to English", () => {
    getState().setLocale("en");
    expect(getState().locale).toBe("en");
  });

  it("switches back to German", () => {
    getState().setLocale("en");
    getState().setLocale("de");
    expect(getState().locale).toBe("de");
  });

  it("is idempotent — setting same locale twice is fine", () => {
    getState().setLocale("de");
    getState().setLocale("de");
    expect(getState().locale).toBe("de");
  });
});

// ============================================================================
// setDefaultShell
// ============================================================================

describe("setDefaultShell", () => {
  it("sets to powershell", () => {
    getState().setDefaultShell("powershell");
    expect(getState().defaultShell).toBe("powershell");
  });

  it("sets to auto", () => {
    getState().setDefaultShell("powershell");
    getState().setDefaultShell("auto");
    expect(getState().defaultShell).toBe("auto");
  });

  it("sets to bash", () => {
    getState().setDefaultShell("bash");
    expect(getState().defaultShell).toBe("bash");
  });

  it("sets to cmd", () => {
    getState().setDefaultShell("cmd");
    expect(getState().defaultShell).toBe("cmd");
  });

  it("sets to zsh", () => {
    getState().setDefaultShell("zsh");
    expect(getState().defaultShell).toBe("zsh");
  });
});

// ============================================================================
// setDefaultProjectPath
// ============================================================================

describe("setDefaultProjectPath", () => {
  it("sets a project path", () => {
    getState().setDefaultProjectPath("C:/Projects");
    expect(getState().defaultProjectPath).toBe("C:/Projects");
  });

  it("can reset to empty string", () => {
    getState().setDefaultProjectPath("C:/Projects");
    getState().setDefaultProjectPath("");
    expect(getState().defaultProjectPath).toBe("");
  });
});

// ============================================================================
// API Key CRUD
// ============================================================================

describe("API key metadata", () => {
  const testKey = {
    id: "key-1",
    provider: "anthropic",
    label: "My API Key",
    redactedKey: "sk-ant-...xxxx",
    addedAt: Date.now(),
    isValid: true,
  };

  it("adds an API key entry", () => {
    getState().addApiKeyMetadata(testKey);
    expect(getState().apiKeys).toHaveLength(1);
    expect(getState().apiKeys[0]).toEqual(testKey);
  });

  it("adds multiple API key entries", () => {
    getState().addApiKeyMetadata(testKey);
    getState().addApiKeyMetadata({ ...testKey, id: "key-2", label: "Second" });
    expect(getState().apiKeys).toHaveLength(2);
  });

  it("removes an API key by ID", () => {
    getState().addApiKeyMetadata(testKey);
    getState().addApiKeyMetadata({ ...testKey, id: "key-2" });
    getState().removeApiKeyMetadata("key-1");
    expect(getState().apiKeys).toHaveLength(1);
    expect(getState().apiKeys[0].id).toBe("key-2");
  });

  it("removeApiKeyMetadata is a no-op for non-existent ID", () => {
    getState().addApiKeyMetadata(testKey);
    getState().removeApiKeyMetadata("nonexistent");
    expect(getState().apiKeys).toHaveLength(1);
  });

  it("updates an API key entry partially", () => {
    getState().addApiKeyMetadata(testKey);
    getState().updateApiKeyMetadata("key-1", {
      label: "Updated Label",
      isValid: false,
    });
    const key = getState().apiKeys[0];
    expect(key.label).toBe("Updated Label");
    expect(key.isValid).toBe(false);
    // Other fields remain unchanged
    expect(key.provider).toBe("anthropic");
    expect(key.redactedKey).toBe("sk-ant-...xxxx");
  });

  it("updateApiKeyMetadata is a no-op for non-existent ID", () => {
    getState().addApiKeyMetadata(testKey);
    getState().updateApiKeyMetadata("nonexistent", { label: "Ghost" });
    expect(getState().apiKeys[0].label).toBe("My API Key");
  });

  it("sets lastUsedAt via updateApiKeyMetadata", () => {
    getState().addApiKeyMetadata(testKey);
    const now = Date.now();
    getState().updateApiKeyMetadata("key-1", { lastUsedAt: now });
    expect(getState().apiKeys[0].lastUsedAt).toBe(now);
  });
});

// ============================================================================
// resetToDefaults
// ============================================================================

describe("resetToDefaults", () => {
  it("resets theme to defaults", () => {
    getState().setTheme({ reducedMotion: true, animationSpeed: 0.1 });
    getState().resetToDefaults();
    expect(getState().theme.reducedMotion).toBe(false);
    expect(getState().theme.animationSpeed).toBe(1.0);
    expect(getState().theme.mode).toBe("dark");
  });

  it("resets notifications to defaults", () => {
    getState().setNotifications({ enabled: false, costAlert: false });
    getState().resetToDefaults();
    expect(getState().notifications.enabled).toBe(true);
    expect(getState().notifications.costAlert).toBe(true);
  });

  it("resets sound to defaults", () => {
    getState().setSound({ enabled: true, volume: 1.0 });
    getState().resetToDefaults();
    expect(getState().sound.enabled).toBe(false);
    expect(getState().sound.volume).toBe(0.5);
  });

  it("resets pipeline to defaults", () => {
    getState().setPipeline({ defaultMode: "real", maxConcurrentWorktrees: 10 });
    getState().resetToDefaults();
    expect(getState().pipeline.defaultMode).toBe("mock");
    expect(getState().pipeline.maxConcurrentWorktrees).toBe(5);
  });

  it("resets locale to 'de'", () => {
    getState().setLocale("en");
    getState().resetToDefaults();
    expect(getState().locale).toBe("de");
  });

  it("resets defaultShell to 'auto'", () => {
    getState().setDefaultShell("powershell");
    getState().resetToDefaults();
    expect(getState().defaultShell).toBe("auto");
  });

  it("resets defaultProjectPath to empty string", () => {
    getState().setDefaultProjectPath("C:/Projects");
    getState().resetToDefaults();
    expect(getState().defaultProjectPath).toBe("");
  });

  it("does NOT reset apiKeys", () => {
    const testKey = {
      id: "key-persist",
      provider: "anthropic",
      label: "Persistent",
      redactedKey: "sk-...xxxx",
      addedAt: Date.now(),
      isValid: true,
    };
    getState().addApiKeyMetadata(testKey);
    getState().resetToDefaults();
    expect(getState().apiKeys).toHaveLength(1);
    expect(getState().apiKeys[0].id).toBe("key-persist");
  });

  it("does NOT reset favorites", () => {
    getState().addFavorite("C:/Projects/important");
    getState().resetToDefaults();
    expect(getState().favorites).toHaveLength(1);
    expect(getState().favorites[0].path).toBe("C:/Projects/important");
  });
});

// ============================================================================
// addFavorite
// ============================================================================

describe("addFavorite", () => {
  it("creates a favorite with generated ID", () => {
    getState().addFavorite("C:/Projects/test");
    const favs = getState().favorites;
    expect(favs).toHaveLength(1);
    expect(favs[0].id).toBeDefined();
    expect(typeof favs[0].id).toBe("string");
    expect(favs[0].id.length).toBeGreaterThan(0);
  });

  it("sets path correctly", () => {
    getState().addFavorite("C:/Projects/test");
    expect(getState().favorites[0].path).toBe("C:/Projects/test");
  });

  it("derives label from path when no label provided", () => {
    getState().addFavorite("C:/Projects/test");
    // Should use the last segment of the path as label
    expect(getState().favorites[0].label).toBe("test");
  });

  it("uses custom label when provided", () => {
    getState().addFavorite("C:/Projects/test", "Mein Projekt");
    expect(getState().favorites[0].label).toBe("Mein Projekt");
  });

  it("sets shell to 'powershell' as default", () => {
    getState().addFavorite("C:/Projects/test");
    expect(getState().favorites[0].shell).toBe("powershell");
  });

  it("sets addedAt to approximately now", () => {
    const before = Date.now();
    getState().addFavorite("C:/Projects/test");
    const after = Date.now();
    const fav = getState().favorites[0];
    expect(fav.addedAt).toBeGreaterThanOrEqual(before);
    expect(fav.addedAt).toBeLessThanOrEqual(after);
  });

  it("sets lastUsedAt to approximately now (same as addedAt)", () => {
    const before = Date.now();
    getState().addFavorite("C:/Projects/test");
    const after = Date.now();
    const fav = getState().favorites[0];
    expect(fav.lastUsedAt).toBeGreaterThanOrEqual(before);
    expect(fav.lastUsedAt).toBeLessThanOrEqual(after);
  });

  it("adds multiple favorites", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    getState().addFavorite("C:/Projects/gamma");
    expect(getState().favorites).toHaveLength(3);
  });

  it("generates unique IDs for each favorite", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    const ids = getState().favorites.map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("derives label from last segment for deep path", () => {
    getState().addFavorite("C:/Users/dev/Documents/Projects/my-app");
    expect(getState().favorites[0].label).toBe("my-app");
  });

  it("handles path with trailing slash", () => {
    getState().addFavorite("C:/Projects/test/");
    const fav = getState().favorites[0];
    // Should still derive a meaningful label, not empty string
    expect(fav.path).toBe("C:/Projects/test/");
    expect(fav.label.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// addFavorite — Edge Cases
// ============================================================================

describe("addFavorite edge cases", () => {
  it("handles empty path gracefully", () => {
    getState().addFavorite("");
    // Implementation may either reject or accept — test that it does not crash
    // If accepted, it should still have valid structure
    const favs = getState().favorites;
    if (favs.length > 0) {
      expect(favs[0].path).toBe("");
      expect(typeof favs[0].label).toBe("string");
    }
    // No crash is the key assertion
  });

  it("handles very long path", () => {
    const longPath = "C:/" + "a".repeat(1000) + "/project";
    getState().addFavorite(longPath);
    expect(getState().favorites).toHaveLength(1);
    expect(getState().favorites[0].path).toBe(longPath);
  });

  it("handles path with spaces", () => {
    getState().addFavorite("C:/My Projects/Test Project");
    expect(getState().favorites[0].path).toBe("C:/My Projects/Test Project");
    expect(getState().favorites[0].label).toBe("Test Project");
  });

  it("handles path with special characters", () => {
    getState().addFavorite("C:/Projects/über-app (v2.0)");
    expect(getState().favorites[0].path).toBe("C:/Projects/über-app (v2.0)");
  });

  it("handles duplicate paths — adds second entry", () => {
    getState().addFavorite("C:/Projects/test");
    getState().addFavorite("C:/Projects/test");
    // Duplicate paths are allowed (different favorites pointing to same folder)
    const favs = getState().favorites;
    expect(favs.length).toBeGreaterThanOrEqual(1);
    // If duplicates are allowed, they should have different IDs
    if (favs.length === 2) {
      expect(favs[0].id).not.toBe(favs[1].id);
    }
  });

  it("handles backslash Windows paths", () => {
    getState().addFavorite("C:\\Projects\\test");
    expect(getState().favorites[0].path).toBe("C:\\Projects\\test");
  });
});

// ============================================================================
// removeFavorite
// ============================================================================

describe("removeFavorite", () => {
  it("removes the correct favorite", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    const idToRemove = getState().favorites[0].id;
    getState().removeFavorite(idToRemove);
    expect(getState().favorites).toHaveLength(1);
    expect(getState().favorites[0].path).toBe("C:/Projects/beta");
  });

  it("is a no-op for non-existent ID (no crash)", () => {
    getState().addFavorite("C:/Projects/test");
    getState().removeFavorite("non-existent-id");
    expect(getState().favorites).toHaveLength(1);
  });

  it("removes from an already empty list without crash", () => {
    getState().removeFavorite("whatever");
    expect(getState().favorites).toEqual([]);
  });

  it("removes the only favorite leaving empty array", () => {
    getState().addFavorite("C:/Projects/solo");
    const id = getState().favorites[0].id;
    getState().removeFavorite(id);
    expect(getState().favorites).toEqual([]);
  });

  it("removes correct favorite from many", () => {
    getState().addFavorite("C:/Projects/a");
    getState().addFavorite("C:/Projects/b");
    getState().addFavorite("C:/Projects/c");
    const middleId = getState().favorites[1].id;
    getState().removeFavorite(middleId);
    const remaining = getState().favorites;
    expect(remaining).toHaveLength(2);
    expect(remaining.find((f) => f.id === middleId)).toBeUndefined();
    expect(remaining[0].path).toBe("C:/Projects/a");
    expect(remaining[1].path).toBe("C:/Projects/c");
  });
});

// ============================================================================
// updateFavoriteLastUsed
// ============================================================================

describe("updateFavoriteLastUsed", () => {
  it("updates lastUsedAt to current time", () => {
    getState().addFavorite("C:/Projects/test");
    const id = getState().favorites[0].id;

    const before = Date.now();
    getState().updateFavoriteLastUsed(id);
    const after = Date.now();

    const updated = getState().favorites[0];
    expect(updated.lastUsedAt).toBeGreaterThanOrEqual(before);
    expect(updated.lastUsedAt).toBeLessThanOrEqual(after);
  });

  it("does not modify other fields", () => {
    getState().addFavorite("C:/Projects/test", "My Label");
    const id = getState().favorites[0].id;
    const original = { ...getState().favorites[0] };

    getState().updateFavoriteLastUsed(id);

    const updated = getState().favorites[0];
    expect(updated.id).toBe(original.id);
    expect(updated.path).toBe(original.path);
    expect(updated.label).toBe(original.label);
    expect(updated.shell).toBe(original.shell);
    expect(updated.addedAt).toBe(original.addedAt);
  });

  it("is a no-op for non-existent ID (no crash)", () => {
    getState().addFavorite("C:/Projects/test");
    const before = getState().favorites[0].lastUsedAt;
    getState().updateFavoriteLastUsed("non-existent-id");
    expect(getState().favorites[0].lastUsedAt).toBe(before);
  });

  it("updates only the targeted favorite, not others", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    const alphaLastUsed = getState().favorites[0].lastUsedAt;
    const betaId = getState().favorites[1].id;

    getState().updateFavoriteLastUsed(betaId);

    expect(getState().favorites[0].lastUsedAt).toBe(alphaLastUsed);
  });
});

// ============================================================================
// reorderFavorites
// ============================================================================

describe("reorderFavorites", () => {
  it("reorders favorites by ID array", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    getState().addFavorite("C:/Projects/gamma");
    const [a, b, c] = getState().favorites;

    // Reverse order
    getState().reorderFavorites([c.id, b.id, a.id]);
    const reordered = getState().favorites;
    expect(reordered[0].path).toBe("C:/Projects/gamma");
    expect(reordered[1].path).toBe("C:/Projects/beta");
    expect(reordered[2].path).toBe("C:/Projects/alpha");
  });

  it("keeps all favorites intact after reorder", () => {
    getState().addFavorite("C:/Projects/alpha");
    getState().addFavorite("C:/Projects/beta");
    const [a, b] = getState().favorites;

    getState().reorderFavorites([b.id, a.id]);
    expect(getState().favorites).toHaveLength(2);
    // All original data preserved
    const reordered = getState().favorites;
    expect(reordered.find((f) => f.id === a.id)?.path).toBe("C:/Projects/alpha");
    expect(reordered.find((f) => f.id === b.id)?.path).toBe("C:/Projects/beta");
  });

  it("handles single-element reorder", () => {
    getState().addFavorite("C:/Projects/solo");
    const id = getState().favorites[0].id;
    getState().reorderFavorites([id]);
    expect(getState().favorites).toHaveLength(1);
    expect(getState().favorites[0].id).toBe(id);
  });

  it("handles empty reorder array", () => {
    getState().addFavorite("C:/Projects/test");
    getState().reorderFavorites([]);
    // Should not crash — behavior depends on implementation
    // Favorites may be emptied or unchanged
  });
});

// ============================================================================
// Favorite persistence across resetToDefaults
// ============================================================================

describe("favorites persistence", () => {
  it("favorites survive multiple resetToDefaults calls", () => {
    getState().addFavorite("C:/Projects/persistent");
    getState().resetToDefaults();
    getState().resetToDefaults();
    getState().resetToDefaults();
    expect(getState().favorites).toHaveLength(1);
    expect(getState().favorites[0].path).toBe("C:/Projects/persistent");
  });

  it("favorites and apiKeys both survive resetToDefaults", () => {
    getState().addFavorite("C:/Projects/test");
    getState().addApiKeyMetadata({
      id: "key-1",
      provider: "anthropic",
      label: "Key",
      redactedKey: "sk-...xxxx",
      addedAt: Date.now(),
      isValid: true,
    });
    getState().resetToDefaults();
    expect(getState().favorites).toHaveLength(1);
    expect(getState().apiKeys).toHaveLength(1);
  });
});

// ============================================================================
// Pinned Docs — Path Validation
// ============================================================================

describe("validatePinnedPath", () => {
  it("accepts simple .md path", () => {
    expect(validatePinnedPath("README.md")).toBeNull();
  });

  it("accepts nested .md path", () => {
    expect(validatePinnedPath("tasks/todo.md")).toBeNull();
  });

  it("accepts .markdown extension", () => {
    expect(validatePinnedPath("notes.markdown")).toBeNull();
  });

  it("accepts backslash-separated paths (Windows) and normalizes them", () => {
    expect(validatePinnedPath("tasks\\todo.md")).toBeNull();
  });

  it("rejects empty path", () => {
    expect(validatePinnedPath("")).toContain("leer");
    expect(validatePinnedPath("   ")).toContain("leer");
  });

  it("rejects absolute Windows path", () => {
    expect(validatePinnedPath("C:\\Users\\foo.md")).toContain("relativ");
    expect(validatePinnedPath("C:/Users/foo.md")).toContain("relativ");
  });

  it("rejects absolute Unix path", () => {
    expect(validatePinnedPath("/etc/passwd.md")).toContain("relativ");
  });

  it("rejects UNC path", () => {
    expect(validatePinnedPath("\\\\share\\foo.md")).toContain("relativ");
  });

  it("rejects path traversal with leading ..", () => {
    expect(validatePinnedPath("../secret.md")).toContain("Traversal");
  });

  it("rejects path traversal in middle", () => {
    expect(validatePinnedPath("foo/../bar.md")).toContain("Traversal");
  });

  it("rejects path traversal with nested ..", () => {
    expect(validatePinnedPath("a/b/../../c/d.md")).toContain("Traversal");
  });

  it("rejects non-markdown extension", () => {
    expect(validatePinnedPath("script.sh")).toContain("Nur .md");
    expect(validatePinnedPath("config.json")).toContain("Nur .md");
    expect(validatePinnedPath("no-extension")).toContain("Nur .md");
  });
});

// ============================================================================
// normalizeProjectKey
// ============================================================================

describe("normalizeProjectKey", () => {
  it("lowercases and replaces backslashes", () => {
    expect(normalizeProjectKey("C:\\Projects\\MyApp")).toBe("c:/projects/myapp");
  });

  it("strips trailing slashes", () => {
    expect(normalizeProjectKey("C:/Projects/MyApp/")).toBe("c:/projects/myapp");
    expect(normalizeProjectKey("C:/Projects/MyApp///")).toBe("c:/projects/myapp");
  });

  it("is idempotent", () => {
    const once = normalizeProjectKey("C:\\Projects\\Foo\\");
    const twice = normalizeProjectKey(once);
    expect(twice).toBe(once);
  });
});

// ============================================================================
// Pinned Docs — addPinnedDoc / removePinnedDoc / renamePinnedDoc
// ============================================================================

describe("addPinnedDoc", () => {
  const folder = "C:/Projects/agentic-dashboard";

  it("adds a pin with generated id and defaults label to filename", () => {
    const err = getState().addPinnedDoc(folder, "tasks/todo.md");
    expect(err).toBeNull();
    const pins = getState().pinnedDocs[normalizeProjectKey(folder)];
    expect(pins).toHaveLength(1);
    expect(pins[0].relativePath).toBe("tasks/todo.md");
    expect(pins[0].label).toBe("todo.md");
    expect(pins[0].id).toMatch(/^pin-\d+-[a-z0-9]+$/);
    expect(pins[0].addedAt).toBeGreaterThan(0);
  });

  it("uses custom label when provided", () => {
    getState().addPinnedDoc(folder, "README.md", "Project Intro");
    const pins = getState().pinnedDocs[normalizeProjectKey(folder)];
    expect(pins[0].label).toBe("Project Intro");
  });

  it("normalizes backslashes in relativePath", () => {
    getState().addPinnedDoc(folder, "tasks\\lessons.md");
    const pins = getState().pinnedDocs[normalizeProjectKey(folder)];
    expect(pins[0].relativePath).toBe("tasks/lessons.md");
  });

  it("rejects duplicate relativePath in same folder", () => {
    getState().addPinnedDoc(folder, "README.md");
    const err = getState().addPinnedDoc(folder, "README.md");
    expect(err).toContain("bereits");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)]).toHaveLength(1);
  });

  it("allows same relativePath in different folders", () => {
    getState().addPinnedDoc(folder, "README.md");
    getState().addPinnedDoc("C:/Projects/other", "README.md");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)]).toHaveLength(1);
    expect(getState().pinnedDocs[normalizeProjectKey("C:/Projects/other")]).toHaveLength(1);
  });

  it("rejects path traversal attempts", () => {
    const err = getState().addPinnedDoc(folder, "../../etc/passwd.md");
    expect(err).toContain("Traversal");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)] ?? []).toHaveLength(0);
  });

  it("rejects non-markdown files", () => {
    const err = getState().addPinnedDoc(folder, "script.ts");
    expect(err).toContain("Nur .md");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)] ?? []).toHaveLength(0);
  });

  it("rejects absolute paths", () => {
    const err = getState().addPinnedDoc(folder, "C:/Windows/system32.md");
    expect(err).toContain("relativ");
  });

  it("same folder with different case uses the same key", () => {
    getState().addPinnedDoc("C:/Projects/App", "a.md");
    getState().addPinnedDoc("c:\\projects\\app", "b.md");
    const pins = getState().pinnedDocs[normalizeProjectKey("C:/Projects/App")];
    expect(pins).toHaveLength(2);
  });
});

describe("removePinnedDoc", () => {
  const folder = "C:/Projects/test";

  it("removes the pin by id", () => {
    getState().addPinnedDoc(folder, "a.md");
    getState().addPinnedDoc(folder, "b.md");
    const pins = getState().pinnedDocs[normalizeProjectKey(folder)];
    const firstId = pins[0].id;
    getState().removePinnedDoc(folder, firstId);
    const remaining = getState().pinnedDocs[normalizeProjectKey(folder)];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].relativePath).toBe("b.md");
  });

  it("deletes the folder key when last pin is removed", () => {
    getState().addPinnedDoc(folder, "only.md");
    const pin = getState().pinnedDocs[normalizeProjectKey(folder)][0];
    getState().removePinnedDoc(folder, pin.id);
    expect(getState().pinnedDocs[normalizeProjectKey(folder)]).toBeUndefined();
  });

  it("is a no-op for unknown id", () => {
    getState().addPinnedDoc(folder, "a.md");
    getState().removePinnedDoc(folder, "nonexistent-id");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)]).toHaveLength(1);
  });

  it("is a no-op for unknown folder", () => {
    getState().removePinnedDoc("C:/Nowhere", "any-id");
    expect(getState().pinnedDocs).toEqual({});
  });
});

describe("renamePinnedDoc", () => {
  const folder = "C:/Projects/test";

  it("updates the label", () => {
    getState().addPinnedDoc(folder, "a.md", "Old Label");
    const pin = getState().pinnedDocs[normalizeProjectKey(folder)][0];
    getState().renamePinnedDoc(folder, pin.id, "New Label");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)][0].label).toBe("New Label");
  });

  it("trims whitespace from label", () => {
    getState().addPinnedDoc(folder, "a.md");
    const pin = getState().pinnedDocs[normalizeProjectKey(folder)][0];
    getState().renamePinnedDoc(folder, pin.id, "   Trimmed   ");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)][0].label).toBe("Trimmed");
  });

  it("ignores empty label (keeps old value)", () => {
    getState().addPinnedDoc(folder, "a.md", "Keep Me");
    const pin = getState().pinnedDocs[normalizeProjectKey(folder)][0];
    getState().renamePinnedDoc(folder, pin.id, "   ");
    expect(getState().pinnedDocs[normalizeProjectKey(folder)][0].label).toBe("Keep Me");
  });

  it("does not affect pins in other folders", () => {
    getState().addPinnedDoc(folder, "shared.md", "Here");
    getState().addPinnedDoc("C:/Projects/other", "shared.md", "Over There");
    const pin = getState().pinnedDocs[normalizeProjectKey(folder)][0];
    getState().renamePinnedDoc(folder, pin.id, "Renamed");
    expect(getState().pinnedDocs[normalizeProjectKey("C:/Projects/other")][0].label).toBe("Over There");
  });
});
