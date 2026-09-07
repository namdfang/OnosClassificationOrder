"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { THEME_COOKIE, THEME_STORAGE_KEY, DEFAULT_THEME, type ThemePreference } from "@/lib/theme";

interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  setTheme: () => {},
});

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return getSystemTheme();
  return pref;
}

function applyTheme(resolved: "light" | "dark") {
  if (resolved === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function setCookie(value: string) {
  document.cookie = `${THEME_COOKIE}=${value};path=/;max-age=${86400 * 365};SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || DEFAULT_THEME;
  });

  const resolved = resolveTheme(theme);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    setCookie(newTheme);
    applyTheme(resolveTheme(newTheme));
  }, []);

  // Listen for system preference changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Apply on mount
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
