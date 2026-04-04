import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

// Block event handler attrs, data attributes, and dangerous URI schemes (XSS prevention)
const PURIFY_ALLOWED_ATTR = ["href", "title", "alt", "src", "class", "id"];
const PURIFY_FORBID_ATTR = [
  "onerror", "onload", "onclick", "onmouseover", "onmouseout",
  "onfocus", "onblur", "onsubmit", "onchange", "oninput",
];
const PURIFY_ALLOWED_URI = /^(?:https?|mailto|tel|#):/i;

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    const raw = md.render(content);
    return DOMPurify.sanitize(raw, {
      ALLOWED_ATTR: PURIFY_ALLOWED_ATTR,
      FORBID_ATTR: PURIFY_FORBID_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: PURIFY_ALLOWED_URI,
    });
  }, [content]);

  return (
    <div className="h-full overflow-auto p-6 bg-surface-raised">
      <div
        className="md-preview max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
