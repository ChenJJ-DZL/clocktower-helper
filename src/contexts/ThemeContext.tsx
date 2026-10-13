"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "modern" | "classic";

const THEME_STORAGE_KEY = "clocktower_theme";
const DEFAULT_THEME: Theme = "classic";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  requestTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  // 记住上次选择（默认经典）。用户可在对局任意阶段自由切换。
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "modern" || saved === "classic") return saved;
  } catch {
    /* 隐私模式等场景读不到 localStorage ⇒ 回落默认 */
  }
  return DEFAULT_THEME;
}

function persistTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* 忽略写入失败（不影响本次会话切换） */
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
    persistTheme(next);
  }, []);

  /**
   * 切换主题 —— 任意阶段、任意次数均可自由切换（无点击次数门禁、无确认弹窗）。
   * 保留 requestTheme 这个入口名是为了不动既有调用点（GlobalNavBar / ScriptSelection）。
   */
  const requestTheme = useCallback(
    (targetTheme: Theme) => {
      setTheme(targetTheme);
    },
    [setTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "modern" ? "classic" : "modern");
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, requestTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "classic",
      setTheme: () => {},
      requestTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
