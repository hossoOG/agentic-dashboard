import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

// Mock @uiw/react-codemirror — CodeMirror does not work in jsdom
vi.mock("@uiw/react-codemirror", () => ({
  __esModule: true,
  default: (props: {
    value: string;
    onChange?: (val: string) => void;
    className?: string;
  }) => (
    <div data-testid="codemirror-mock" className={props.className}>
      <textarea
        data-testid="codemirror-textarea"
        value={props.value}
        onChange={(e) => props.onChange?.(e.target.value)}
      />
    </div>
  ),
}));

// Mock codemirror extensions that would fail in jsdom
vi.mock("@codemirror/lang-markdown", () => ({
  markdown: vi.fn(() => []),
}));

vi.mock("./languageSupport", () => ({
  codeLanguages: [],
}));

vi.mock("@codemirror/view", () => ({
  keymap: { of: vi.fn(() => []) },
}));

vi.mock("./editorTheme", () => ({
  neonEditorTheme: [],
}));

describe("CodeMirrorEditor", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing and displays the mock editor", () => {
    const { getByTestId } = render(
      <CodeMirrorEditor value="# Hello" onChange={onChange} />,
    );
    expect(getByTestId("codemirror-mock")).toBeTruthy();
  });

  it("passes value to the underlying editor", () => {
    const { getByTestId } = render(
      <CodeMirrorEditor value="test content" onChange={onChange} />,
    );
    const textarea = getByTestId("codemirror-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("test content");
  });

  it("wraps editor in a full-size container div", () => {
    const { container } = render(
      <CodeMirrorEditor value="" onChange={onChange} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("h-full");
    expect(wrapper.className).toContain("w-full");
  });
});
