"use client";

import { ReactNode } from "react";

interface GameLayoutProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}

/**
 * GameLayout - Enforces a strict split-screen layout for the game
 * 
 * Left Panel: Flexible width, contains the seating chart/table
 * Right Panel: Fixed width (400px), contains the control console
 * 
 * Both panels are contained within a full-viewport container with no overflow
 */
export function GameLayout({ leftPanel, rightPanel }: GameLayoutProps) {
  return (
    <div className="h-full w-full overflow-hidden bg-slate-950 flex flex-row">
      {/* Left Panel - Table/Seating Chart */}
      <main className="flex-1 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          {leftPanel}
        </div>
      </main>

      {/* Right Panel - Control Console - Fixed width for 1600px base */}
      <aside className="w-[450px] h-full flex flex-col border-l border-white/10 bg-slate-900 shrink-0 overflow-hidden">
        {rightPanel}
      </aside>
    </div>
  );
}

