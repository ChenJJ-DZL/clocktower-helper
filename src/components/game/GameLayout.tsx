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
        <main className="flex-1 relative overflow-hidden bg-transparent">
          <div className="absolute inset-0 flex items-center justify-center bg-blue-900/20">
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
