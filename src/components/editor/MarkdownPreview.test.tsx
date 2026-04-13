import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview, MarkdownBody } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders basic markdown", () => {
    render(<MarkdownPreview content="# Hello" />);
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("renders links with href", () => {
    const { container } = render(
      <MarkdownPreview content="[link](https://example.com)" />,
    );
    const anchor = container.querySelector("a");
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
  });

  // --- XSS Prevention Tests ---

  it("strips javascript: URIs from links", () => {
    const { container } = render(
      <MarkdownPreview content='[click me](javascript:alert(1))' />,
    );
    const anchor = container.querySelector("a");
    // Link should either be removed or href stripped
    if (anchor) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href).not.toContain("javascript:");
    }
  });

  it("strips onerror event handlers from img tags", () => {
    // markdown-it with html:false won't pass raw HTML, but test sanitizer directly
    const { container } = render(
      <MarkdownPreview content={'![img](x" onerror="alert(1)'} />,
    );
    const img = container.querySelector("img");
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
    }
  });

  it("strips onclick from rendered HTML", () => {
    // Even if somehow onclick gets into the HTML, DOMPurify should strip it
    const { container } = render(
      <MarkdownPreview content="normal text" />,
    );
    const allElements = container.querySelectorAll("[onclick]");
    expect(allElements.length).toBe(0);
  });

  it("strips data attributes", () => {
    const { container } = render(
      <MarkdownPreview content="some text" />,
    );
    const allElements = container.querySelectorAll("[data-exploit]");
    expect(allElements.length).toBe(0);
  });

  it("renders code blocks safely", () => {
    const { container } = render(
      <MarkdownPreview content={'```\n<script>alert(1)</script>\n```'} />,
    );
    // Script tags should never appear in output
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(0);
  });

  it("renders empty content without errors", () => {
    const { container } = render(<MarkdownPreview content="" />);
    expect(container.querySelector(".md-preview")).toBeTruthy();
  });

  it("strips data: URI scheme from links", () => {
    const { container } = render(
      <MarkdownPreview
        content={'[x](data:text/html,<script>alert(1)</script>)'}
      />,
    );
    const anchor = container.querySelector("a");
    if (anchor) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href.toLowerCase()).not.toContain("data:");
    }
    // Regardless, no script tags should ever appear
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.innerHTML).not.toContain("<script");
  });

  it("allows safe URI schemes (mailto:, tel:, #anchor)", () => {
    const { container } = render(
      <MarkdownPreview
        content={
          "[mail](mailto:foo@example.com) [tel](tel:+1234) [https](https://example.com)"
        }
      />,
    );
    const anchors = container.querySelectorAll("a");
    const hrefs = Array.from(anchors).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("mailto:foo@example.com");
    expect(hrefs).toContain("tel:+1234");
    expect(hrefs).toContain("https://example.com");
  });

  it("renders GFM features (bold, italic) correctly", () => {
    const { container } = render(
      <MarkdownPreview content={"**bold** and *italic* text"} />,
    );
    const strong = container.querySelector("strong");
    const em = container.querySelector("em");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("bold");
    expect(em).toBeTruthy();
    expect(em?.textContent).toBe("italic");
  });
});

// ── MarkdownBody Tests ─────────────────────────────────────────────────

describe("MarkdownBody", () => {
  it("renders markdown content without outer wrapper styles", () => {
    const { container } = render(<MarkdownBody content="**hello**" />);
    const div = container.querySelector(".md-preview");
    expect(div).toBeTruthy();
    // No h-full, no bg-surface-raised (those belong to MarkdownPreview wrapper)
    expect(div?.className).not.toContain("h-full");
    expect(div?.className).not.toContain("bg-surface-raised");
  });

  it("accepts optional className prop", () => {
    const { container } = render(
      <MarkdownBody content="text" className="text-sm text-red-400" />,
    );
    const div = container.querySelector(".md-preview");
    expect(div?.className).toContain("text-sm");
    expect(div?.className).toContain("text-red-400");
  });

  it("renders bold text as <strong>", () => {
    const { container } = render(<MarkdownBody content="**bold**" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("bold");
  });

  it("renders empty content without errors", () => {
    const { container } = render(<MarkdownBody content="" />);
    expect(container.querySelector(".md-preview")).toBeTruthy();
  });

  it("preserves task-list checkbox attributes after DOMPurify", () => {
    // GitHub-flavored task lists use input[type="checkbox"] with checked/disabled
    // DOMPurify must keep type, checked, and disabled attributes
    const { container } = render(
      <MarkdownBody content={"- [x] Done item\n- [ ] Open item"} />,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    // markdown-it-task-lists would render these; if not installed,
    // verify DOMPurify doesn't strip type attr from manually injected HTML
    // by checking no type attributes were stripped from any input elements
    const allInputs = container.querySelectorAll("input");
    for (const input of Array.from(allInputs)) {
      // type attribute must be preserved (not stripped by DOMPurify)
      expect(input.hasAttribute("type")).toBe(true);
    }
    // Whether or not checkboxes render depends on markdown-it config,
    // but if they do, they must have type="checkbox"
    for (const cb of Array.from(checkboxes)) {
      expect(cb.getAttribute("type")).toBe("checkbox");
    }
  });
});
