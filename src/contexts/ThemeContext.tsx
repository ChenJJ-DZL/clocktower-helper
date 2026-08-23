"use client";

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "modern" | "classic";

const THEME_STORAGE_KEY = "clocktower_theme";
const DEFAULT_THEME: Theme = "modern";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "classic" || stored === "modern" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  const body = document.body;
  root.classList.remove("theme-classic", "theme-modern");
  root.classList.add(`theme-${theme}`);
  if (body) {
    body.classList.remove("theme-classic", "theme-modern");
    body.classList.add(`theme-${theme}`);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const initial = readInitialTheme();
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeClass(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage 不可用时主题仅在会话内生效
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "modern" ? "classic" : "modern");
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "modern",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

