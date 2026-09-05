"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "../common/ErrorBoundary";

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
 * Both panels are contained within a full-viewport container with no overflow.
 * Uses high-performance CSS backgrounds with zero-overhead GPU compositing to prevent mobile browser crashes.
 */
export function GameLayout({ topBar, leftPanel, rightPanel }: GameLayoutProps) {
  return (
    <div className="h-full w-full overflow-hidden bg-transparent flex flex-col">
      {/* Top Bar - Navbar / Toolbar */}
      {topBar && (
        <div className="topbar-frost shrink-0 border-b border-white/10 bg-slate-900/95 backdrop-blur-sm z-50">
          <ErrorBoundary fallbackTitle="导航栏异常">
            {topBar}
          </ErrorBoundary>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
        {/* Left Panel - Table/Seating Chart */}
        <main className="flex-1 relative overflow-hidden bg-slate-950">
          {/* 高性能魔典桌盘背景 - 纯色与轻量纹理叠加，彻底移除导致移动端 OOM 崩溃的 CSS filter 与 transition */}
          <div
            className="absolute inset-0 bg-no-repeat bg-center pointer-events-none opacity-80"
            style={{
              backgroundImage: "url('/assets/table-bg.png')",
              backgroundSize: "cover",
            }}
          />

          {/* 深邃暗光遮罩层：以极低开销实现原本 filter 的明暗与对比度质感 */}
          <div className="absolute inset-0 bg-slate-950/30 pointer-events-none z-0" />

          {/* 徕卡风格柔和暗角 (Soft Vignette) */}
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 55%, rgba(2, 6, 23, 0.45) 85%, rgba(2, 6, 23, 0.8) 100%)",
            }}
          />

          {/* 圆桌与交互内容 */}
          <div className="relative z-10 w-full h-full flex items-center justify-center">
            <ErrorBoundary fallbackTitle="圆桌图层渲染异常">
              {leftPanel}
            </ErrorBoundary>
          </div>
        </main>

        {/* Right Panel - Control Console - Fixed width for 1600px base */}
        <aside className="w-[450px] h-full flex flex-col border-l border-white/10 bg-slate-900 shrink-0 overflow-hidden">
          <ErrorBoundary fallbackTitle="控制台渲染异常">
            {rightPanel}
          </ErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
