import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewSessionDefaultsPanel } from "./NewSessionDefaultsPanel";
import { useSettingsStore } from "../../store/settingsStore";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

describe("NewSessionDefaultsPanel", () => {
  beforeEach(() => {
    openMock.mockReset();
    useSettingsStore.setState({
      defaultShell: "auto",
      defaultProjectPath: "",
    });
  });

  it("persists the shell selection when changed", () => {
    render(<NewSessionDefaultsPanel />);
    const select = screen.getByLabelText(/Standard-Shell/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "powershell" } });
    expect(useSettingsStore.getState().defaultShell).toBe("powershell");
  });

  it("writes the picked folder to defaultProjectPath", async () => {
    openMock.mockResolvedValue("C:/work/repo");
    render(<NewSessionDefaultsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Wählen/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().defaultProjectPath).toBe("C:/work/repo");
    });
  });

  it("does nothing when the picker is cancelled", async () => {
    openMock.mockResolvedValue(null);
    render(<NewSessionDefaultsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Wählen/i }));
    await waitFor(() => {
      expect(openMock).toHaveBeenCalled();
    });
    expect(useSettingsStore.getState().defaultProjectPath).toBe("");
  });

  it("offers a Leeren button when a default is set", () => {
    useSettingsStore.setState({ defaultProjectPath: "C:/old/path" });
    render(<NewSessionDefaultsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Leeren/i }));
    expect(useSettingsStore.getState().defaultProjectPath).toBe("");
  });
});
