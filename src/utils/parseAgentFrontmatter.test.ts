import { describe, it, expect } from "vitest";
import { parseAgentFrontmatter } from "./parseAgentFrontmatter";

describe("parseAgentFrontmatter", () => {
  it("parses full frontmatter with all fields", () => {
    const content = [
      "---",
      "model: opus",
      "max-turns: 20",
      "allowed-tools: Read, Glob, Grep, Bash(ls *)",
      "---",
      "",
      "# Architect Agent",
      "",
      "You are a planning agent.",
    ].join("\n");

    const result = parseAgentFrontmatter(content, "architect.md");

    expect(result.metadata.name).toBe("architect");
    expect(result.metadata.model).toBe("opus");
    expect(result.metadata.maxTurns).toBe(20);
    expect(result.metadata.allowedTools).toEqual([
      "Read",
      "Glob",
      "Grep",
      "Bash(ls *)",
    ]);
    expect(result.metadata.description).toBe("Architect Agent");
    expect(result.body).toContain("You are a planning agent.");
  });

  it("uses filename as name when no name in frontmatter", () => {
    const content = "---\nmodel: sonnet\n---\n\nSome body.";
    const result = parseAgentFrontmatter(content, "test-engineer.md");

    expect(result.metadata.name).toBe("test-engineer");
    expect(result.metadata.model).toBe("sonnet");
  });

  it("handles content without frontmatter", () => {
    const content = "# Simple Agent\n\nNo frontmatter here.";
    const result = parseAgentFrontmatter(content, "simple.md");

    expect(result.metadata.name).toBe("simple");
    expect(result.metadata.model).toBe("");
    expect(result.metadata.maxTurns).toBeNull();
    expect(result.metadata.allowedTools).toEqual([]);
    expect(result.metadata.description).toBe("Simple Agent");
    expect(result.body).toBe(content);
  });

  it("handles empty content gracefully", () => {
    const result = parseAgentFrontmatter("", "empty.md");

    expect(result.metadata.name).toBe("empty");
    expect(result.metadata.description).toBe("");
    expect(result.body).toBe("");
  });

  it("falls back to 'Unknown' when no filename provided", () => {
    const result = parseAgentFrontmatter("Some content");
    expect(result.metadata.name).toBe("Unknown");
  });

  it("handles malformed frontmatter (no closing delimiter)", () => {
    const content = "---\nmodel: opus\nThis never closes";
    const result = parseAgentFrontmatter(content, "broken.md");

    expect(result.metadata.name).toBe("broken");
    // Falls back to extracting description from content
    expect(result.body).toBe(content);
  });

  it("extracts description from first non-heading line if no heading", () => {
    const content = "---\nmodel: opus\n---\n\nThis is a plain description.";
    const result = parseAgentFrontmatter(content, "agent.md");

    expect(result.metadata.description).toBe("This is a plain description.");
  });

  it("respects explicit name and description in frontmatter", () => {
    const content = [
      "---",
      "name: Custom Name",
      "description: Custom description",
      "model: haiku",
      "---",
      "",
      "# Heading ignored for description",
    ].join("\n");

    const result = parseAgentFrontmatter(content, "agent.md");

    expect(result.metadata.name).toBe("Custom Name");
    expect(result.metadata.description).toBe("Custom description");
  });
});
