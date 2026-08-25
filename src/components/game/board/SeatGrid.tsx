"use client";

import type React from "react";
import type { Seat } from "../../../../app/data";
import type { NightInfoResult } from "../../../types/game";
import { StaggerContainer, StaggerItem } from "../../common/AnimationWrapper";
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
  } = props;

  // 圆桌模式：使用 SeatNode + 圆形布局
  if (layoutMode === "circle") {
    const evilTwinSeat = seats.find((s) => s.role?.id === "evil_twin");
    const goodTwinSeat = evilTwinSeat
      ? seats.find(
          (other) =>
            other.id !== evilTwinSeat.id &&
            (other.role?.type === "townsfolk" ||
              other.role?.type === "outsider") &&
            !other.isEvilConverted &&
            !other.isDead
        ) ||
        seats.find((other) => other.id !== evilTwinSeat.id && !other.isDead)
      : null;

    const twinPair =
      evilTwinSeat && goodTwinSeat
        ? {
            pos1: getSeatPosition(
              seats.findIndex((s) => s.id === evilTwinSeat.id),
              seats.length,
              isPortrait
            ),
            pos2: getSeatPosition(
              seats.findIndex((s) => s.id === goodTwinSeat.id),
              seats.length,
              isPortrait
            ),
          }
        : null;

    return (
      <StaggerContainer>
        {/* 🔮 镜像双子视觉连线 */}
        {twinPair && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            <defs>
              <linearGradient id="twinLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
              </linearGradient>
              <filter id="twinGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <line
              x1={twinPair.pos1.x}
              y1={twinPair.pos1.y}
              x2={twinPair.pos2.x}
              y2={twinPair.pos2.y}
              stroke="url(#twinLineGrad)"
              strokeWidth="3.5"
              strokeDasharray="8 5"
              filter="url(#twinGlow)"
              className="animate-pulse"
            />
          </svg>
        )}

        {seats.map((seat, index) => (
          <StaggerItem
            key={seat.id}
            className="absolute inset-0 block w-full h-full pointer-events-none"
          >
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
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
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
          console.log(
            "[SeatGrid matrix] Seat touched:",
            seat.id,
            "Selected role:",
            seat.role?.name
          );
          onSeatClick(seat.id);
        };
        return (
          <button
            key={seat.id}
            onClick={handleClick}
            onTouchStart={(e) => {
              e.stopPropagation();
              // Don't preventDefault here to allow click events to work
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
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
