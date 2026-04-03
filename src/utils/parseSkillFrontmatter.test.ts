import { describe, it, expect } from "vitest";
import { parseSkillFrontmatter } from "./parseSkillFrontmatter";

describe("parseSkillFrontmatter", () => {
  describe("no frontmatter", () => {
    it("returns defaults when content has no ---", () => {
      const result = parseSkillFrontmatter("Just some content");
      expect(result.metadata.name).toBe("Unknown");
      expect(result.metadata.userInvokable).toBe(false);
      expect(result.body).toBe("Just some content");
    });

    it("returns defaults when opening --- has no closing ---", () => {
      const result = parseSkillFrontmatter("---\nname: Test\nNo closing delimiter");
      expect(result.metadata.name).toBe("Unknown");
      expect(result.body).toBe("---\nname: Test\nNo closing delimiter");
    });
  });

  describe("basic fields", () => {
    it("parses name and description", () => {
      const content = "---\nname: MySkill\ndescription: Does things\n---\nBody here";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.name).toBe("MySkill");
      expect(result.metadata.description).toBe("Does things");
    });

    it("parses user-invokable true", () => {
      const content = "---\nuser-invokable: true\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.userInvokable).toBe(true);
    });

    it("parses user-invokable yes", () => {
      const content = "---\nuser-invokable: yes\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.userInvokable).toBe(true);
    });

    it("parses user-invokable false", () => {
      const content = "---\nuser-invokable: false\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.userInvokable).toBe(false);
    });

    it("defaults user-invokable to false when missing", () => {
      const content = "---\nname: Test\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.userInvokable).toBe(false);
    });
  });

  describe("args parsing", () => {
    it("parses a single arg", () => {
      const content = [
        "---",
        "args:",
        "  - name: file",
        "    description: The file path",
        "    required: true",
        "---",
        "",
      ].join("\n");
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.args).toHaveLength(1);
      expect(result.metadata.args[0]).toEqual({
        name: "file",
        description: "The file path",
        required: true,
      });
    });

    it("parses multiple args", () => {
      const content = [
        "---",
        "args:",
        "  - name: input",
        "    description: Input file",
        "    required: true",
        "  - name: output",
        "    description: Output file",
        "    required: false",
        "---",
        "",
      ].join("\n");
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.args).toHaveLength(2);
      expect(result.metadata.args[0].name).toBe("input");
      expect(result.metadata.args[1].name).toBe("output");
      expect(result.metadata.args[1].required).toBe(false);
    });

    it("defaults required to false and description to empty", () => {
      const content = "---\nargs:\n  - name: flag\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.args[0]).toEqual({
        name: "flag",
        description: "",
        required: false,
      });
    });

    it("returns empty args when no args defined", () => {
      const content = "---\nname: NoArgs\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.metadata.args).toEqual([]);
    });
  });

  describe("body extraction", () => {
    it("extracts body after closing ---", () => {
      const content = "---\nname: Test\n---\nThis is the body.\nSecond line.";
      const result = parseSkillFrontmatter(content);
      expect(result.body).toBe("This is the body.\nSecond line.");
    });

    it("returns empty body when nothing after closing ---", () => {
      const content = "---\nname: Test\n---\n";
      const result = parseSkillFrontmatter(content);
      expect(result.body).toBe("");
    });
  });
});
