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

