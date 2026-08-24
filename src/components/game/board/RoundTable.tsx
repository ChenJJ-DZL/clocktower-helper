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
  onSeatClick: (id: number) => void;
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
  isTimerRunning?: boolean;
  onTimerStart?: () => void;
  onTimerPause?: () => void;
  onTimerReset?: () => void;
  // Dusk phase selection indicators
  nominator?: number | null;
  nominee?: number | null;
  nominationRecords?: {
    nominators: Set<number> | number[];
    nominees: Set<number> | number[];
  };

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
  isTimerRunning,
  onTimerStart,
  onTimerPause,
  onTimerReset,
  nominator = null,
  nominee = null,
  nominationRecords,
  nightOrderPreview = [],
  onOpenNightOrderPreview,
  onSetRedNemesis,
  onEditNote,
  onContextMenu,
  seatNotes = {},
}: RoundTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(35); // Default radius in percentage
  const [_seatSize, setSeatSize] = useState(72); // Seat size in pixels
  // 默认夜晚展开：在每个夜晚开始时（首夜或后续夜晚），默认展开夜晚行动顺序
  const [isNightOrderExpanded, setIsNightOrderExpanded] = useState(
    gamePhase === "firstNight" || gamePhase === "night"
  );

  // 监听夜晚阶段与夜晚轮数变更，在新夜晚开始时自动重置为展开
  const prevNightRef = useRef<{ phase?: string; count?: number }>({
    phase: gamePhase,
    count: nightCount,
  });

  useEffect(() => {
    const isNight = gamePhase === "firstNight" || gamePhase === "night";
    const wasNight =
      prevNightRef.current.phase === "firstNight" ||
      prevNightRef.current.phase === "night";
    const countChanged = prevNightRef.current.count !== nightCount;

    // 当进入夜晚阶段（从白天/黄昏/检查切入夜晚），或夜晚轮数推进时，默认展开
    if (isNight && (!wasNight || countChanged)) {
      setIsNightOrderExpanded(true);
    }

    prevNightRef.current = { phase: gamePhase, count: nightCount };
  }, [gamePhase, nightCount]);

  // Pan and Zoom states
  const [scale, setScale] = useState(1);
  const _controls = useAnimation();
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardDimension, setBoardDimension] = useState<number>(800);

  // Dynamic dimension and radius adjustment based on container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLayout = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (containerWidth === 0 || containerHeight === 0) return;

      const minDimension = Math.min(containerWidth, containerHeight);
      setBoardDimension(minDimension);

      const isMobile = window.innerWidth <= 768;
      let baseRadius = isMobile ? 36 : 38;
      if (seats.length > 15) baseRadius -= 2;
      if (seats.length > 18) baseRadius -= 2;

      setRadius(Math.max(26, Math.min(40, baseRadius)));
      const baseSeatSize = isMobile ? 48 : 58;
      const sizeMultiplier =
        seats.length > 15 ? 0.85 : seats.length > 12 ? 0.92 : 1;
      setSeatSize(Math.round(baseSeatSize * sizeMultiplier));
    };

    updateLayout();

    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [seats.length]);

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if pressing ctrl/cmd or if on a trackpad
    if (e.cancelable) {
      e.preventDefault();
    }
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

  const handleSeatContextMenu = (e: React.MouseEvent, seatId: number) => {
    e.preventDefault();
    // 统一通知父组件设置 contextMenu，由统一的上下文菜单组件渲染，杜绝双重弹窗
    if (onContextMenu) onContextMenu(e, seatId);
  };

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
        className="relative flex items-center justify-center origin-center shrink-0"
        style={{
          width: `${boardDimension}px`,
          height: `${boardDimension}px`,
          x: panX,
          y: panY,
        }}
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
            gamePhase={gamePhase}
            nominationRecords={nominationRecords}
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
            isTimerRunning={isTimerRunning ?? true}
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
            className="w-10 h-10 flex items-center justify-center bg-slate-900/90 hover:bg-slate-800 rounded-full border border-white/20 shadow-lg text-white transition-all overflow-hidden"
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
      <div className="absolute top-3 right-3 z-40 w-[145px] lg:w-[155px] max-w-[28vw] pointer-events-auto transition-all duration-200">
        <div className="rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/10 bg-slate-950/60">
            <div className="text-[11px] font-bold text-slate-200 truncate">夜晚行动顺序</div>
            <button
              type="button"
              onClick={() => setIsNightOrderExpanded((prev) => !prev)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 border border-white/10 transition font-bold"
              title={isNightOrderExpanded ? "收起顺序" : "展开完整顺序"}
            >
              {isNightOrderExpanded ? "收起" : "展开"}
            </button>
          </div>
          {isNightOrderExpanded && (
            <div className="px-2.5 py-1.5 space-y-1">
              {nightOrderPreview.length === 0 ? (
                <div className="text-[10px] text-slate-400 py-1 text-center">
                  暂无顺序
                </div>
              ) : (
                nightOrderPreview.map((item, idx) => {
                  const uniqueKey = `night-order-${item.seatNo}-${item.roleName}-${item.order ?? idx}`;
                  return (
                    <div
                      key={uniqueKey}
                      className="flex items-center justify-between text-[11px] leading-tight py-0.5 border-b border-white/5 last:border-0"
                    >
                      <div className="text-slate-200 truncate font-medium">
                        {idx + 1}. [{item.seatNo}号] {item.roleName}
                      </div>
                      <div className="text-amber-400 font-mono text-[10px] ml-1 shrink-0">
                        #{item.order ?? idx + 1}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
