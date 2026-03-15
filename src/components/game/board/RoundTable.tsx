"use client";

import { motion, useAnimation, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GamePhase, Role, Seat } from "../../../../app/data";
import type { NightInfoResult } from "../../../types/game";
import { SeatGrid } from "./SeatGrid";
import { TableCenterHUD } from "./TableCenterHUD";

interface RoundTableProps {
  seats: Seat[];
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  isPortrait: boolean;
  longPressingSeats: Set<number>;
  onSeatClick: (seat: Seat) => void;
  onContextMenu?: (e: React.MouseEvent, seatId: number) => void;
  onTouchStart: (e: React.TouchEvent, seatId: number) => void;
  onTouchEnd: (e: React.TouchEvent, seatId: number) => void;
  onTouchMove: (e: React.TouchEvent, seatId: number) => void;
  setSeatRef: (id: number, el: HTMLDivElement | null) => void;
  getDisplayRoleType: (seat: Seat) => string | null;
  getDisplayRole: (seat: Seat | null | undefined) => Role | null;
  typeColors: Record<string, string>;
  // Optional props for TableCenterHUD
  gamePhase?: GamePhase;
  nightCount?: number;
  timer?: number;
  formatTimer?: (seconds: number) => string;
  onTimerStart?: () => void;
  onTimerPause?: () => void;
  onTimerReset?: () => void;
  // Dusk phase selection indicators
  nominator?: number | null;
  nominee?: number | null;

  // Night order preview panel (top-right)
  nightOrderPreview?: Array<{
    roleName: string;
    seatNo: number;
    order: number | null;
  }>;
  onOpenNightOrderPreview?: () => void;
  // Red Nemesis action
  onSetRedNemesis?: (seatId: number) => void;
  // Notes action
  onEditNote?: (seatId: number) => void;
  seatNotes?: Record<number, string>;
}

/**
 * RoundTable - Enhanced circular table with dynamic radius calculation
 * Ensures seats are fully contained with proper padding and larger touch targets
 */
export function RoundTable({
  seats,
  nightInfo,
  selectedActionTargets,
  isPortrait,
  longPressingSeats,
  onSeatClick,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  setSeatRef,
  getDisplayRoleType,
  typeColors,
  gamePhase,
  nightCount,
  timer,
  formatTimer,
  onTimerStart,
  onTimerPause,
  onTimerReset,
  nominator = null,
  nominee = null,
  nightOrderPreview = [],
  onOpenNightOrderPreview,
  onSetRedNemesis,
  onEditNote,
  seatNotes = {},
}: RoundTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(35); // Default radius in percentage
  const [_seatSize, setSeatSize] = useState(72); // Seat size in pixels
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    seatId: number;
  } | null>(null);

  // Pan and Zoom states
  const [scale, setScale] = useState(1);
  const _controls = useAnimation();
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if pressing ctrl/cmd or if on a trackpad
    e.preventDefault();
    const zoomSensitivity = 0.002;
    const minScale = 0.5;
    const maxScale = 2.5;

    setScale((prev) => {
      let newScale = prev - e.deltaY * zoomSensitivity;
      if (newScale < minScale) newScale = minScale;
      if (newScale > maxScale) newScale = maxScale;
      return newScale;
    });
  };

  const handleResetView = () => {
    setScale(1);
    panX.set(0);
    panY.set(0);
  };

  // Close context menu on any click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleSeatContextMenu = (e: React.MouseEvent, seatId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, seatId });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLayout = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Base resolution: 1600x900
      // Left panel takes remaining space after 450px right panel = ~1150px width
      // Use the smaller dimension to ensure it fits
      const minDimension = Math.min(containerWidth, containerHeight);

      // Seat size: 112px (7rem = w-28 h-28) for "Big Seat" mode - touch-friendly
      const seatSizePx = 112;

      // Padding: 50px on each side (increased to account for larger seats)
      const padding = 50;

      // Calculate available space
      const availableSize = minDimension - padding * 2;

      // Calculate radius: (availableSize / 2) - (seatSize / 2) - some margin
      // Convert to percentage for the 100x100 coordinate system
      // Reduced margin to ensure seats don't get cut off
      const availableRadius = availableSize / 2 - seatSizePx / 2 - 15; // 15px margin
      const radiusPercent = (availableRadius / minDimension) * 100;

      // Ensure radius is reasonable (between 20% and 35% - reduced to fit larger seats)
      const clampedRadius = Math.max(20, Math.min(35, radiusPercent));

      setRadius(clampedRadius);
      setSeatSize(seatSizePx);
    };

    updateLayout();

    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Create a custom getSeatPosition function that uses the dynamic radius
  const getDynamicSeatPosition = (
    index: number,
    total?: number,
    _isPortrait?: boolean
  ) => {
    const angle = (index / (total ?? seats.length)) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x: x.toFixed(2), y: y.toFixed(2) };
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      onWheel={handleWheel}
    >
      <motion.div
        ref={boardRef}
        className="relative w-full h-full flex items-center justify-center origin-center"
        style={{ x: panX, y: panY }}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        drag
        dragConstraints={containerRef}
        dragElastic={0.2}
      >
        <div className="absolute inset-0">
          <SeatGrid
            layoutMode="circle"
            seatScale={1}
            seats={seats}
            nightInfo={nightInfo}
            selectedActionTargets={selectedActionTargets}
            isPortrait={isPortrait}
            longPressingSeats={longPressingSeats}
            onSeatClick={onSeatClick}
            onContextMenu={handleSeatContextMenu}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            setSeatRef={setSeatRef}
            getSeatPosition={(i: number) =>
              getDynamicSeatPosition(i, seats.length, isPortrait)
            }
            getDisplayRoleType={getDisplayRoleType}
            typeColors={typeColors}
            nominator={nominator}
            nominee={nominee}
            seatNotes={seatNotes}
          />
        </div>

        {/* Center UI */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <TableCenterHUD
            gamePhase={gamePhase || "setup"}
            nightCount={nightCount || 0}
            timer={timer || 0}
            formatTimer={formatTimer || ((s) => `${s}`)}
            onTimerStart={onTimerStart}
            onTimerPause={onTimerPause}
            onTimerReset={onTimerReset}
          />
        </div>
      </motion.div>

      {/* Control Overlay */}
      <div className="absolute bottom-4 right-4 z-40 flex flex-col gap-2">
        {(scale !== 1 || panX.get() !== 0 || panY.get() !== 0) && (
          <button
            onClick={handleResetView}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 rounded-full border border-white/20 shadow-xl backdrop-blur-sm text-white"
            title="复位视角"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>

      {/* Top-right: Night order panel */}
      <div className="absolute top-3 right-3 z-40 w-[200px] max-w-[30vw] pointer-events-auto">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="text-xs font-bold text-slate-200">夜晚行动顺序</div>
            <button
              type="button"
              onClick={() => onOpenNightOrderPreview?.()}
              className="text-xs px-2 py-1 rounded-md bg-slate-700/80 hover:bg-slate-600/80 text-slate-100 border border-white/10"
              title="展开完整顺序"
            >
              展开
            </button>
          </div>
          <div className="max-h-[180px] overflow-auto px-3 py-2 space-y-2">
            {nightOrderPreview.length === 0 ? (
              <div className="text-xs text-slate-400">
                暂无（未生成顺序或不在夜晚阶段）
              </div>
            ) : (
              nightOrderPreview.slice(0, 10).map((item, idx) => (
                <div
                  key={`night-order-${idx}`}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="text-slate-200 truncate">
                    {item.order ?? "?"}. [{item.seatNo}号] {item.roleName}
                  </div>
                  <div className="text-slate-400 ml-2 shrink-0">
                    #{item.order ?? "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-slate-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden min-w-[160px] animate-in fade-in zoom-in duration-100"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            boxShadow:
              "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-slate-400 p-2 border-b border-slate-700 mb-1">
            Seat {contextMenu.seatId + 1}
          </div>
          <button
            className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-slate-700 rounded border-b border-slate-700"
            onClick={() => {
              if (onEditNote) onEditNote(contextMenu.seatId);
              setContextMenu(null);
            }}
          >
            📝 编辑备忘录
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 rounded"
            onClick={() => {
              if (onSetRedNemesis) onSetRedNemesis(contextMenu.seatId);
              setContextMenu(null);
            }}
          >
            设为红罗刹目标 (天敌)
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-400 text-xs flex items-center gap-3 transition-colors"
          >
            <span className="opacity-0 text-lg">🔴</span>
            <span>取消</span>
          </button>
        </div>
      )}
    </div>
  );
}
