"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "modern" | "classic";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "clocktower_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("modern");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "classic" || saved === "modern") {
      setThemeState(saved);
      applyThemeClass(saved);
    } else {
      applyThemeClass("modern");
    }
  }, []);

  const applyThemeClass = (t: Theme) => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("theme-modern", "theme-classic");
    body.classList.remove("theme-modern", "theme-classic");

    root.classList.add(`theme-${t}`);
    body.classList.add(`theme-${t}`);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyThemeClass(newTheme);
  };

  const toggleTheme = () => {
    const next = theme === "modern" ? "classic" : "modern";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "modern" as Theme,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
