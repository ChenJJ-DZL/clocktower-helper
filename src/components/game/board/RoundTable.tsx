"use client";

import { motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GamePhase, Role, Seat } from "../../../../app/data";
import type { NightInfoResult } from "../../../types/game";
import { SeatGrid } from "./SeatGrid";
import { TableCenterHUD } from "./TableCenterHUD";

function getDragPortalRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let root = document.getElementById("clocktower-drag-portal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "clocktower-drag-portal-root";
    root.style.cssText =
      "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; pointer-events: none !important; z-index: 99999999 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;";
    document.body.appendChild(root);
  }
  return root;
}

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
  winResult?: "good" | "evil" | null;
  winReason?: string | null;
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
  // Swap seats action
  onSwapSeats?: (seatId1: number, seatId2: number) => void;
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
  winResult,
  winReason,
  onTimerStart,
  onTimerPause,
  onTimerReset,
  nominator = null,
  nominee = null,
  nominationRecords,
  nightOrderPreview = [],
  onOpenNightOrderPreview: _onOpenNightOrderPreview,
  onSetRedNemesis: _onSetRedNemesis,
  onEditNote: _onEditNote,
  onContextMenu,
  seatNotes = {},
  onSwapSeats,
}: RoundTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [radius, setRadius] = useState(35); // Default radius in percentage
  const [seatSize, setSeatSize] = useState(72); // Seat size in pixels

  // 拖拽换位状态与引用
  const [activeDragSeatId, setActiveDragSeatId] = useState<number | null>(null);
  const [swapTargetSeatId, setSwapTargetSeatId] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const activeDragSeatIdRef = useRef<number | null>(null);
  const swapTargetSeatIdRef = useRef<number | null>(null);
  const seatElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const seatSizeRef = useRef<number>(112);
  const floatingTokenRef = useRef<HTMLDivElement | null>(null);

  const handleSetSeatRef = (id: number, el: HTMLDivElement | null) => {
    seatElementsRef.current[id] = el;
    setSeatRef(id, el);
  };

  // 仅在首夜前（准备/选本/检视阶段，游戏正式开始前）允许自由拖拽换位；一旦进入首夜（firstNight/day/dusk/night等），游戏正式开始，不可再拖拽换位
  const isDragSwapEnabled =
    gamePhase === "setup" ||
    gamePhase === "check" ||
    gamePhase === "scriptSelection";

  // 画布平移状态（采用原生 PointerEvent 管理，彻底杜绝与座位 Framer Motion 内部 drag 产生手势冲突）
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handleBoardPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== -1) return; // 仅响应主键/触摸
    if (activeDragSeatIdRef.current !== null) return; // 正在拖拽座位时绝对禁止画布平移

    // 当未放大（scale <= 1）时，圆桌已完整居中展示，完全禁止画布平移以避免漂移跑偏
    if (scale <= 1) return;

    const target = e.target as HTMLElement | null;
    if (isDragSwapEnabled) {
      // 游戏开始前（首夜前）：如果指针落在座位或座位内部元素上，完全禁止画布平移，由座位拖拽独立接管
      if (target?.closest(".seat-node") || target?.closest(".seat-token")) {
        return;
      }
    }

    // 点击在画布空白背景或中心区域，且已放大（scale > 1）时启动受限平移
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panX.get(),
      panY: panY.get(),
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    if (activeDragSeatIdRef.current !== null) {
      isPanningRef.current = false;
      return;
    }
    if (scale <= 1) {
      panX.set(0);
      panY.set(0);
      isPanningRef.current = false;
      return;
    }

    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    const container = containerRef.current;
    if (container) {
      // 严格边界约束：平移不能超过放大产生的可见溢出范围，杜绝画面被拖飞到视野外
      const maxPanX = (container.clientWidth * (scale - 1)) / 2;
      const maxPanY = (container.clientHeight * (scale - 1)) / 2;
      const targetX = panStartRef.current.panX + deltaX;
      const targetY = panStartRef.current.panY + deltaY;
      panX.set(Math.max(-maxPanX, Math.min(maxPanX, targetX)));
      panY.set(Math.max(-maxPanY, Math.min(maxPanY, targetY)));
    } else {
      panX.set(panStartRef.current.panX + deltaX);
      panY.set(panStartRef.current.panY + deltaY);
    }
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // 触发拖拽移动换位后，座位圆心绝对锁定绑定在鼠标位置
  const handleSeatDragStart = (
    seatId: number,
    e: React.PointerEvent | React.TouchEvent | React.MouseEvent
  ) => {
    if (!isDragSwapEnabled) return;

    const extractCoords = (ev: any) => {
      if (ev.touches && ev.touches.length > 0) {
        return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      }
      if (typeof ev.clientX === "number" && !Number.isNaN(ev.clientX)) {
        return { x: ev.clientX, y: ev.clientY };
      }
      if (ev.nativeEvent) {
        if (ev.nativeEvent.touches && ev.nativeEvent.touches.length > 0) {
          return {
            x: ev.nativeEvent.touches[0].clientX,
            y: ev.nativeEvent.touches[0].clientY,
          };
        }
        if (typeof ev.nativeEvent.clientX === "number") {
          return { x: ev.nativeEvent.clientX, y: ev.nativeEvent.clientY };
        }
      }
      return null;
    };

    const initialCoords = extractCoords(e);
    if (!initialCoords) return;

    dragPosRef.current = { x: initialCoords.x, y: initialCoords.y };
    activeDragSeatIdRef.current = seatId;
    swapTargetSeatIdRef.current = null;
    setActiveDragSeatId(seatId);
    setSwapTargetSeatId(null);
    setDragPos({ x: initialCoords.x, y: initialCoords.y });

    const updateGhostPosition = (cx: number, cy: number) => {
      if (floatingTokenRef.current) {
        floatingTokenRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) scale(1.15)`;
      }
    };

    updateGhostPosition(initialCoords.x, initialCoords.y);

    const handleWindowMove = (moveEvent: PointerEvent | TouchEvent) => {
      const coords = extractCoords(moveEvent);
      if (!coords) return;
      const currentX = coords.x;
      const currentY = coords.y;

      dragPosRef.current = { x: currentX, y: currentY };
      updateGhostPosition(currentX, currentY);

      // 计算重叠 50% 判定（圆心绑定在当前鼠标 (clientX, clientY) 位置）
      const currentSeatSize = seatSizeRef.current || seatSize || 112;
      const draggedRect = {
        left: currentX - currentSeatSize / 2,
        right: currentX + currentSeatSize / 2,
        top: currentY - currentSeatSize / 2,
        bottom: currentY + currentSeatSize / 2,
        width: currentSeatSize,
        height: currentSeatSize,
      };
      const draggedArea = currentSeatSize * currentSeatSize;

      let bestTargetId: number | null = null;
      let maxOverlapRatio = 0;

      for (const otherSeat of seats) {
        if (otherSeat.id === seatId) continue;
        const targetEl = seatElementsRef.current[otherSeat.id];
        if (!targetEl) continue;

        const targetRect = targetEl.getBoundingClientRect();
        const targetArea = targetRect.width * targetRect.height;
        if (targetArea <= 0) continue;

        const overlapW = Math.max(
          0,
          Math.min(draggedRect.right, targetRect.right) -
            Math.max(draggedRect.left, targetRect.left)
        );
        const overlapH = Math.max(
          0,
          Math.min(draggedRect.bottom, targetRect.bottom) -
            Math.max(draggedRect.top, targetRect.top)
        );
        const overlapArea = overlapW * overlapH;
        const minArea = Math.min(draggedArea, targetArea);
        const overlapRatio = minArea > 0 ? overlapArea / minArea : 0;

        // 当重叠面积达到 50% 以上 (>= 0.5)
        if (overlapRatio >= 0.5 && overlapRatio > maxOverlapRatio) {
          maxOverlapRatio = overlapRatio;
          bestTargetId = otherSeat.id;
        }
      }

      if (swapTargetSeatIdRef.current !== bestTargetId) {
        swapTargetSeatIdRef.current = bestTargetId;
        setSwapTargetSeatId(bestTargetId);
      }
    };

    const handleWindowUp = () => {
      window.removeEventListener("pointermove", handleWindowMove);
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("pointercancel", handleWindowUp);
      window.removeEventListener("touchmove", handleWindowMove);
      window.removeEventListener("touchend", handleWindowUp);
      window.removeEventListener("touchcancel", handleWindowUp);

      if (floatingTokenRef.current) {
        floatingTokenRef.current.style.transform =
          "translate3d(-9999px, -9999px, 0)";
      }

      const targetId = swapTargetSeatIdRef.current;
      const sourceId = activeDragSeatIdRef.current;

      if (sourceId !== null && targetId !== null && sourceId !== targetId) {
        if (onSwapSeats) {
          onSwapSeats(sourceId, targetId);
        }
      }

      dragPosRef.current = null;
      activeDragSeatIdRef.current = null;
      swapTargetSeatIdRef.current = null;
      setActiveDragSeatId(null);
      setSwapTargetSeatId(null);
      setDragPos(null);
    };

    window.addEventListener("pointermove", handleWindowMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
    window.addEventListener("touchmove", handleWindowMove, { passive: false });
    window.addEventListener("touchend", handleWindowUp);
    window.addEventListener("touchcancel", handleWindowUp);
  };

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
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const boardRef = useRef<HTMLDivElement>(null);

  // Dynamic radius adjustment based on viewport and seat count (NaN-safe, RAF debounced)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const updateLayout = () => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      const containerWidth = el.clientWidth || el.offsetWidth || 0;
      const containerHeight = el.clientHeight || el.offsetHeight || 0;

      // 如果容器尚未完成渲染或尺寸异常，使用兜底安全值，避免除以0产生 NaN
      if (containerWidth < 50 || containerHeight < 50) {
        setRadius(32);
        setSeatSize(80);
        return;
      }

      const minDimension = Math.min(containerWidth, containerHeight);
      const isMobile = window.innerWidth <= 768;

      // 座位基础尺寸：根据人数和视口动态伸缩
      const baseSeatSize = isMobile ? 56 : seats.length > 15 ? 88 : 100;
      const padding = isMobile ? 24 : 45;
      const availableSize = minDimension - padding * 2;

      // 计算可用半径
      const availableRadius = availableSize / 2 - baseSeatSize / 2 - (isMobile ? 8 : 12);
      let radiusPercent = (availableRadius / minDimension) * 100;

      // 席位过多时微调半径防止重叠
      if (seats.length > 15) radiusPercent -= 1.5;
      if (seats.length > 18) radiusPercent -= 1.5;

      // 严格限制安全百分比在 22% ~ 38% 之间，杜绝 NaN 或溢出
      const safeRadius = Number.isFinite(radiusPercent)
        ? Math.max(22, Math.min(38, radiusPercent))
        : 32;

      setRadius(safeRadius);
      setSeatSize(baseSeatSize);
    };

    updateLayout();

    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateLayout);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
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
    const seatCount = total ?? seats.length ?? 1;
    const safeTotal = seatCount > 0 ? seatCount : 1;
    const safeRadius = Number.isFinite(radius) ? radius : 32;
    const angle = (index / safeTotal) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + safeRadius * Math.cos(angle);
    const y = 50 + safeRadius * Math.sin(angle);
    return {
      x: (Number.isFinite(x) ? x : 50).toFixed(2),
      y: (Number.isFinite(y) ? y : 50).toFixed(2),
    };
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      onWheel={handleWheel}
    >
      <motion.div
        ref={boardRef}
        className="relative w-full h-full flex items-center justify-center origin-center select-none"
        style={{ x: panX, y: panY }}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerCancel={handleBoardPointerUp}
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
            setSeatRef={handleSetSeatRef}
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
            isDraggable={isDragSwapEnabled}
            activeDragSeatId={activeDragSeatId}
            swapTargetSeatId={swapTargetSeatId}
            onSeatDragStart={handleSeatDragStart}
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
            winResult={winResult}
            winReason={winReason}
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
            <div className="text-[11px] font-bold text-slate-200 truncate">
              夜晚行动顺序
            </div>
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

      {/* 触发拖拽移动换位后，渲染全视口固定浮层（通过专用 Portal 挂载，彻底摆脱所有容器、Flex、CSS 规则干扰，绝对 100% 同心） */}
      {typeof document !== "undefined" &&
        activeDragSeatId !== null &&
        (() => {
          const root = getDragPortalRoot();
          if (!root) return null;
          const currentX = dragPosRef.current?.x ?? dragPos?.x ?? 0;
          const currentY = dragPosRef.current?.y ?? dragPos?.y ?? 0;

          return createPortal(
            <div
              ref={floatingTokenRef}
              className="fixed pointer-events-none z-[99999999] select-none will-change-transform"
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                margin: 0,
                width: `${seatSizeRef.current || seatSize || 112}px`,
                height: `${seatSizeRef.current || seatSize || 112}px`,
                transform: `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%) scale(1.15)`,
                transformOrigin: "center center",
                transition: "none",
              }}
            >
              {(() => {
                const activeSeat = seats.find((s) => s.id === activeDragSeatId);
                if (!activeSeat) return null;
                const displayType = getDisplayRoleType(activeSeat);
                const colorClass = displayType
                  ? typeColors[displayType]
                  : "border-gray-600 text-gray-400";
                const glowClass =
                  displayType === "townsfolk"
                    ? "glow-townsfolk"
                    : displayType === "outsider"
                      ? "glow-outsider"
                      : displayType === "minion"
                        ? "glow-minion"
                        : displayType === "demon"
                          ? "glow-demon"
                          : "";
                const roleName = activeSeat.role?.name || "空";

                return (
                  <div
                    className={`relative w-full h-full rounded-full border-4 ${colorClass} ${glowClass} flex items-center justify-center bg-slate-900 shadow-[0_0_50px_rgba(251,191,36,1)] ring-4 ring-amber-400`}
                  >
                    {/* 左上角序号圆圈 */}
                    <div className="absolute left-[14.6%] top-[14.6%] -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-800 border-2 border-slate-600 text-white flex items-center justify-center font-bold shadow-md text-xs md:text-sm">
                        {activeSeat.id + 1}
                      </div>
                    </div>

                    {/* 居中角色名称 */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                      <span
                        className="text-lg md:text-2xl font-black drop-shadow-md leading-none text-center text-white"
                        style={{
                          textShadow:
                            "0 2px 4px rgba(0,0,0,0.9), 0 0 4px black",
                        }}
                      >
                        {roleName}
                      </span>
                    </div>

                    {/* 玩家名称提示 */}
                    {activeSeat.playerName && (
                      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-full bg-black/80 text-[10px] text-amber-200 border border-amber-500/40 whitespace-nowrap pointer-events-none">
                        {activeSeat.playerName}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>,
            root
          );
        })()}
    </div>
  );
}
