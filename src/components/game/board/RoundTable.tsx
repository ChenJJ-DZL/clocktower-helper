"use client";

import { useEffect, useRef, useState } from "react";
import { Seat, Role, GamePhase } from "../../../../app/data";
import { NightInfoResult } from "../../../types/game";
import { SeatGrid } from "./SeatGrid";
import { getSeatPosition } from "../../../utils/gameRules";
import { TableCenterHUD } from "./TableCenterHUD";

interface RoundTableProps {
  seats: Seat[];
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  isPortrait: boolean;
  longPressingSeats: Set<number>;
  onSeatClick: (seat: Seat) => void;
  onContextMenu: (e: React.MouseEvent, seatId: number) => void;
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
  nightOrderPreview?: Array<{ roleName: string; seatNo: number; order: number | null }>;
  onOpenNightOrderPreview?: () => void;
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
  onContextMenu,
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
}: RoundTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(35); // Default radius in percentage
  const [seatSize, setSeatSize] = useState(72); // Seat size in pixels

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
      const availableSize = minDimension - (padding * 2);

      // Calculate radius: (availableSize / 2) - (seatSize / 2) - some margin
      // Convert to percentage for the 100x100 coordinate system
      // Reduced margin to ensure seats don't get cut off
      const availableRadius = (availableSize / 2) - (seatSizePx / 2) - 15; // 15px margin
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
  const getDynamicSeatPosition = (index: number, total?: number, isPortrait?: boolean) => {
    const angle = (index / (total ?? seats.length)) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x: x.toFixed(2), y: y.toFixed(2) };
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
    >
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
              <div className="text-xs text-slate-400">暂无（未生成顺序或不在夜晚阶段）</div>
            ) : (
              nightOrderPreview.slice(0, 10).map((item, idx) => (
                <div key={`${item.roleName}-${item.seatNo}-${idx}`} className="flex items-center justify-between text-xs">
                  <div className="text-slate-200 truncate">
                    {idx + 1}. [{item.seatNo}号] {item.roleName}
                  </div>
                  <div className="text-slate-400 ml-2 shrink-0">#{item.order ?? '—'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Decorative table ring - REMOVED borders per requirements */}

      {/* Subtle background circle for table surface - REMOVED borders per requirements */}

      {/* Seats container */}
      <div className="relative w-full h-full" style={{ position: 'relative' }}>
        <SeatGrid
          seats={seats}
          nightInfo={nightInfo}
          selectedActionTargets={selectedActionTargets}
          isPortrait={isPortrait}
          seatScale={seatSize / 112} // Scale factor: 112px / base 112px (7rem) = 1.0 for "Big Seat" mode
          longPressingSeats={longPressingSeats}
          onSeatClick={onSeatClick}
          onContextMenu={onContextMenu}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchMove={onTouchMove}
          setSeatRef={setSeatRef}
          getSeatPosition={getDynamicSeatPosition}
          getDisplayRoleType={getDisplayRoleType}
          typeColors={typeColors}
          layoutMode="circle"
          nominator={nominator}
          nominee={nominee}
        />
      </div>

      {/* Table Center HUD */}
      {gamePhase !== undefined && nightCount !== undefined && timer !== undefined && formatTimer && (
        <TableCenterHUD
          gamePhase={gamePhase}
          nightCount={nightCount}
          timer={timer}
          formatTimer={formatTimer}
          onTimerStart={onTimerStart}
          onTimerPause={onTimerPause}
          onTimerReset={onTimerReset}
        />
      )}
    </div>
  );
}

