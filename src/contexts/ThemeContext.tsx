"use client";

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { showAlert } from "../utils/nativeDialogShim";

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
  // 现代版皮肤未开发完成，默认强制进入官方原版经典皮肤
  return DEFAULT_THEME;
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
  const modernClicksRef = useRef<number>(0);

  useEffect(() => {
    const initial = readInitialTheme();
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyThemeClass(next);
  }, []);

  const requestTheme = useCallback(
    (targetTheme: Theme) => {
      if (targetTheme === "classic") {
        modernClicksRef.current = 0;
        setTheme("classic");
        return;
      }

      if (targetTheme === "modern") {
        if (theme === "modern") {
          return;
        }

        modernClicksRef.current += 1;
        if (modernClicksRef.current < 8) {
          showAlert("该功能正在开发中……", "功能提示");
        } else {
          // 连续点击 8 次，开启现代版 UI
          modernClicksRef.current = 0;
          setTheme("modern");
          showAlert(
            "已开启现代版UI调试模式！\n再次点击1次「经典」即可切换回原版。",
            "开发者调试"
          );
        }
      }
    },
    [setTheme, theme]
  );

  const toggleTheme = useCallback(() => {
    requestTheme(theme === "modern" ? "classic" : "modern");
  }, [requestTheme, theme]);

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
