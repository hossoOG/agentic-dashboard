import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./Input";
import { Search } from "lucide-react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("Input", () => {
  it("renders with placeholder", () => {
    render(<Input placeholder="Suchen..." />);
    expect(screen.getByPlaceholderText("Suchen...")).toBeTruthy();
  });

  it("renders label and links it to input", () => {
    render(<Input label="Ordner" />);
    const label = screen.getByText("Ordner");
    expect(label.tagName).toBe("LABEL");
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("id")).toBe("input-ordner");
    expect(label.getAttribute("for")).toBe("input-ordner");
  });

  it("renders error message", () => {
    render(<Input error="Pflichtfeld" />);
    expect(screen.getByText("Pflichtfeld")).toBeTruthy();
  });

  it("applies error border when error is set", () => {
    render(<Input error="Fehler" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-red-500");
  });

  it("applies normal border when no error", () => {
    render(<Input />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("border-neutral-700");
    expect(input.className).not.toContain("border-red-500");
  });

  it("renders icon", () => {
    render(<Input icon={<Search data-testid="search-icon" />} />);
    expect(screen.getByTestId("search-icon")).toBeTruthy();
  });

  it("adds left padding when icon is present", () => {
    render(<Input icon={<Search />} />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("pl-7");
  });

  it("fires onChange", () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "test" },
    });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("supports readOnly", () => {
    render(<Input readOnly value="Nur lesen" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("supports disabled", () => {
    render(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("applies size sm classes", () => {
    render(<Input size="sm" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("py-1");
    expect(input.className).toContain("text-xs");
  });
});
