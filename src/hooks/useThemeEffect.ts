import { useEffect } from "react";
import { useSettingsStore } from "../store/settingsStore";

/**
 * Syncs the theme mode from settingsStore to the <html> element's class list.
 * Call once in App.tsx. The class toggles CSS variable blocks in index.css.
 */
export function useThemeEffect() {
  const mode = useSettingsStore((s) => s.theme.mode);

  useEffect(() => {
    const root = document.documentElement;

    // Brief transition class for smooth color change
    root.classList.add("theme-transition");

    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Remove transition class after animation completes
    const timer = setTimeout(() => root.classList.remove("theme-transition"), 250);
    return () => clearTimeout(timer);
  }, [mode]);
}
