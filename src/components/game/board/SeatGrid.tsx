"use client";

import type React from "react";
import { useRef } from "react";
import type { Seat } from "../../../../app/data";
import type { NightInfoResult } from "../../../types/game";
import { LONG_PRESS_MS } from "../../../utils/longPress";
import { SeatNode } from "../../SeatNode";

export interface SeatGridProps {
  seats: Seat[];
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  isPortrait: boolean;
  seatScale: number;
  longPressingSeats: Set<number>;
  onSeatClick: (id: number) => void;
  onSeatLongPress?: (seat: Seat) => void;
  onContextMenu: (e: React.MouseEvent, seatId: number) => void;
  onTouchStart: (e: React.TouchEvent, seatId: number) => void;
  onTouchEnd: (e: React.TouchEvent, seatId: number) => void;
  onTouchMove: (e: React.TouchEvent, seatId: number) => void;
  setSeatRef: (id: number, el: HTMLDivElement | null) => void;
  getSeatPosition: (
    index: number,
    total?: number,
    isPortrait?: boolean
  ) => { x: string; y: string };
  getDisplayRoleType: (seat: Seat) => string | null;
  typeColors: Record<string, string>;
  layoutMode?: "circle" | "matrix";
  // Dusk phase selection indicators
  gamePhase?: string;
  nominationRecords?: {
    nominators: Set<number> | number[];
    nominees: Set<number> | number[];
  };
  nominator?: number | null;
  nominee?: number | null;
  seatNotes?: Record<number, string>;
  // 拖拽换位相关 Props
  isDraggable?: boolean;
  activeDragSeatId?: number | null;
  swapTargetSeatId?: number | null;
  onSeatDragStart?: (seatId: number, e: any) => void;
  onSeatDrag?: (seatId: number, e: any, info: any) => void;
  onSeatDragEnd?: (seatId: number, e: any, info: any) => void;
}

export function SeatGrid(props: SeatGridProps) {
  const {
    seats,
    nightInfo,
    selectedActionTargets,
    isPortrait,
    seatScale,
    longPressingSeats,
    onSeatClick,
    onContextMenu,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    setSeatRef,
    getSeatPosition,
    getDisplayRoleType,
    typeColors,
    layoutMode = "circle",
    gamePhase,
    nominationRecords,
    nominator = null,
    nominee = null,
    seatNotes = {},
    isDraggable = false,
    activeDragSeatId = null,
    swapTargetSeatId = null,
    onSeatDragStart,
    onSeatDrag,
    onSeatDragEnd,
  } = props;

  // 矩阵视图（席位表）的长按触发右键菜单：触屏设备（iPhone 等）没有右键，
  // 按住 LONG_PRESS_MS（1000ms，与圆桌 SeatNode 完全一致）即打开同一个菜单，
  // 无需松开；滑动会取消，短按仍是「选中座位」。
  // 注意：这两个 ref 必须在下面的 early return（圆桌模式）之前调用，否则违反 Hooks 规则。
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFiredRef = useRef(false);

  // 圆桌模式：使用 SeatNode + 圆形布局（轻量直接渲染，彻底移除移动端 15 层全屏 StaggerItem 导致的 700MB+ 显存溢出与 WebKit OOM 崩溃）
  if (layoutMode === "circle") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {seats.map((seat, index) => (
          <SeatNode
            key={seat.id}
            seat={seat}
            index={index}
            seats={seats}
            isPortrait={isPortrait}
            seatScale={seatScale}
            nightInfo={nightInfo}
            selectedActionTargets={selectedActionTargets}
            longPressingSeats={longPressingSeats}
            onSeatClick={onSeatClick}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            setSeatRef={setSeatRef}
            getSeatPosition={getSeatPosition}
            getDisplayRoleType={getDisplayRoleType}
            typeColors={typeColors}
            gamePhase={gamePhase}
            nominationRecords={nominationRecords}
            nominator={nominator}
            nominee={nominee}
            seatNote={seatNotes[seat.id]}
            isDraggable={isDraggable}
            isBeingDragged={activeDragSeatId === seat.id}
            isSwapTarget={swapTargetSeatId === seat.id}
            onSeatDragStart={onSeatDragStart}
            onSeatDrag={onSeatDrag}
            onSeatDragEnd={onSeatDragEnd}
          />
        ))}
      </div>
    );
  }

  // 矩阵模式：紧凑的座位卡片，用于配置界面
  const _cols = Math.min(8, Math.max(4, seats.length));

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 w-full">
      {seats.map((seat) => {
        const isDead = seat.isDead;
        const hasRole = !!seat.role;
        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          console.log(
            "[SeatGrid matrix] Seat clicked:",
            seat.id,
            "Selected role:",
            seat.role?.name
          );
          onSeatClick(seat.id);
        };
        const handleTouchEnd = (e: React.TouchEvent) => {
          e.stopPropagation();
          e.preventDefault();
          if (lpTimerRef.current) {
            clearTimeout(lpTimerRef.current);
            lpTimerRef.current = null;
          }
          // 长按已触发过菜单 → 不再当作选中；否则是按普通点击处理
          if (!lpFiredRef.current) onSeatClick(seat.id);
        };
        return (
          <button
            key={seat.id}
            onClick={handleClick}
            onTouchStart={(e) => {
              e.stopPropagation();
              // Don't preventDefault here to allow click events to work
              lpFiredRef.current = false;
              if (lpTimerRef.current) clearTimeout(lpTimerRef.current);
              const touch = e.touches[0];
              lpTimerRef.current = setTimeout(() => {
                lpTimerRef.current = null;
                lpFiredRef.current = true;
                // 合成与右键一致的参数，复用同一个菜单组件
                onContextMenu(
                  {
                    clientX: touch?.clientX ?? 0,
                    clientY: touch?.clientY ?? 0,
                    preventDefault() {},
                  } as unknown as React.MouseEvent,
                  seat.id
                );
              }, LONG_PRESS_MS);
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              // 滑动（例如滚动列表）应取消长按，避免误触菜单
              if (lpTimerRef.current) {
                clearTimeout(lpTimerRef.current);
                lpTimerRef.current = null;
              }
            }}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => onContextMenu(e, seat.id)}
            className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 text-xs transition ${
              hasRole
                ? "bg-slate-800/80 border-slate-500 text-slate-100"
                : "bg-slate-900/60 border-slate-600 text-slate-500"
            } ${isDead ? "opacity-60 line-through" : ""}`}
            style={{
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="font-bold mb-0.5">{seat.id + 1}号</div>
            <div className="text-[10px] truncate max-w-[5rem]">
              {seat.role?.name ?? "未分配"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
