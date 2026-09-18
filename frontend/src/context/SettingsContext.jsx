import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readStorage, writeStorage } from "../utils/storage.js";

const DEFAULT_SETTINGS = {
  theme: "dark",
  editorFontSize: 14,
  editorWordWrap: false,
  editorMinimap: false,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...readStorage("settings", {}) }));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    writeStorage("settings", settings);
  }, [settings]);

  const updateSettings = useCallback((changes) => setSettings((current) => ({ ...current, ...changes })), []);
  const toggleTheme = useCallback(
    () => setSettings((current) => ({ ...current, theme: current.theme === "dark" ? "light" : "dark" })),
    []
  );

  const value = useMemo(() => ({ settings, updateSettings, toggleTheme }), [settings, updateSettings, toggleTheme]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
