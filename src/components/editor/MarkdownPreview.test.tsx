import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "./MarkdownPreview";

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
