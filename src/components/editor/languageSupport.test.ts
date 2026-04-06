import { describe, it, expect } from "vitest";
import { codeLanguages } from "./languageSupport";

describe("codeLanguages (trimmed language list)", () => {
  it("exports between 15 and 25 language descriptions", () => {
    // We target ~20 languages; guard against accidental bloat or removal
    expect(codeLanguages.length).toBeGreaterThanOrEqual(15);
    expect(codeLanguages.length).toBeLessThanOrEqual(25);
  });

  it("includes all required languages for markdown code blocks", () => {
    const names = codeLanguages.map((l) => l.name);

    // Must-have languages per issue #113
    const required = [
      "JavaScript",
      "TypeScript",
      "JSON",
      "HTML",
      "CSS",
      "Rust",
      "YAML",
      "TOML",
      "Shell",
      "Python",
      "SQL",
      "Markdown",
    ];

    for (const lang of required) {
      expect(names).toContain(lang);
    }
  });

  it("resolves aliases correctly (e.g. 'bash' maps to Shell)", () => {
    const shell = codeLanguages.find((l) => l.name === "Shell");
    expect(shell).toBeDefined();
    // LanguageDescription stores aliases — verify 'bash' can be matched
    const matched = codeLanguages.find(
      (l) => l.name === "Shell" && l.alias.includes("bash"),
    );
    expect(matched).toBeDefined();
  });

  it("does not include bloat languages (e.g. APL, Brainfuck, Cobol)", () => {
    const names = codeLanguages.map((l) => l.name);
    const bloat = ["APL", "Brainfuck", "Cobol", "Fortran", "Haskell", "Perl"];

    for (const lang of bloat) {
      expect(names).not.toContain(lang);
    }
  });

  it("every entry has a load() function for lazy loading", () => {
    for (const lang of codeLanguages) {
      expect(typeof lang.load).toBe("function");
    }
  });
});
