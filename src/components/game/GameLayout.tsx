"use client";

import type { ReactNode } from "react";

interface GameLayoutProps {
  topBar?: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

/**
 * GameLayout - Enforces a strict split-screen layout for the game
 *
 * Top Bar: Optional toolbar row (navbar with undo/redo, history, etc.)
 * Left Panel: Flexible width, contains the seating chart/table
 * Right Panel: Fixed width (450px), contains the control console
 *
 * Both panels are contained within a full-viewport container with no overflow
 */
export function GameLayout({ topBar, leftPanel, rightPanel }: GameLayoutProps) {
  return (
    <div className="h-full w-full overflow-hidden bg-transparent flex flex-col">
      {/* Top Bar - Navbar / Toolbar */}
      {topBar && (
        <div className="shrink-0 border-b border-white/10 bg-slate-900/95 backdrop-blur-sm z-50">
          {topBar}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Left Panel - Table/Seating Chart */}
        <main className="flex-1 relative overflow-hidden bg-slate-950">
          {/* 徕卡质感自适应背景图（明亮通透、高微反差与浓郁色彩） */}
          <div
            className="absolute inset-0 bg-no-repeat bg-center pointer-events-none transition-all duration-700"
            style={{
              backgroundImage: "url('/assets/table-bg.png')",
              backgroundSize: "100% 100%",
              filter: "brightness(0.90) contrast(1.18) saturate(1.12)",
            }}
          />

          {/* 徕卡风格柔和边缘微暗角 (Leica Soft Vignette) */}
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 62%, rgba(0, 0, 0, 0.22) 86%, rgba(0, 0, 0, 0.60) 100%)",
              boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.5)",
            }}
          />

          {/* 圆桌与交互内容 */}
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            {leftPanel}
          </div>
        </main>

        {/* Right Panel - Control Console - Fixed width for 1600px base */}
        <aside className="w-[450px] h-full flex flex-col border-l border-white/10 bg-slate-900 shrink-0 overflow-hidden">
          {rightPanel}
        </aside>
      </div>
    </div>
  );
}
