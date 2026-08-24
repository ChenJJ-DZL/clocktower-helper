"use client";

import type React from "react";

interface ScaleLayoutProps {
  children: React.ReactNode;
}

/**
 * ScaleLayout - Dynamic Full-screen Responsive Viewport
 * Dynamically fills 100% of the screen width and height with zero letterboxing/pillarboxing
 */
export function ScaleLayout({ children }: ScaleLayoutProps) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950 flex flex-col">
      {children}
    </div>
  );
}
