import { createContext, useContext, useCallback, useEffect, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "theme"; // "light" | "dark" | "system"

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveIsDark(theme) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemPrefersDark(); // "system"
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (resolveIsDark(theme)) root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch {
      return "system";
    }
  });

  // Apply on change + persist.
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Follow the OS while in "system" mode.
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState(next), []);

  // Convenience: toggle between explicit light/dark based on what's showing now.
  const toggle = useCallback(() => {
    setThemeState((prev) => (resolveIsDark(prev) ? "light" : "dark"));
  }, []);

  const isDark = resolveIsDark(theme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
