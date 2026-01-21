"use client";

import React from "react";
import { Seat } from "../../../../app/data";
import { NightInfoResult } from "../../../types/game";
import { SeatNode } from "../../SeatNode";

export interface SeatGridProps {
  seats: Seat[];
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  isPortrait: boolean;
  seatScale: number;
  longPressingSeats: Set<number>;
  onSeatClick: (seat: Seat) => void;
  onSeatLongPress?: (seat: Seat) => void;
  onContextMenu: (e: React.MouseEvent, seatId: number) => void;
  onTouchStart: (e: React.TouchEvent, seatId: number) => void;
  onTouchEnd: (e: React.TouchEvent, seatId: number) => void;
  onTouchMove: (e: React.TouchEvent, seatId: number) => void;
  setSeatRef: (id: number, el: HTMLDivElement | null) => void;
  getSeatPosition: (index: number, total?: number, isPortrait?: boolean) => { x: string; y: string };
  getDisplayRoleType: (seat: Seat) => string | null;
  typeColors: Record<string, string>;
  layoutMode?: "circle" | "matrix";
  // Dusk phase selection indicators
  nominator?: number | null;
  nominee?: number | null;
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
    nominator = null,
    nominee = null,
  } = props;

  // 圆桌模式：使用 SeatNode + 圆形布局
  if (layoutMode === "circle") {
    return (
      <>
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
            onSeatClick={(id) => {
              const clickedSeat = seats.find((s) => s.id === id);
              if (clickedSeat) {
                onSeatClick(clickedSeat);
              }
            }}
            onContextMenu={onContextMenu}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            setSeatRef={setSeatRef}
            getSeatPosition={getSeatPosition}
            getDisplayRoleType={getDisplayRoleType}
            typeColors={typeColors}
            nominator={nominator}
            nominee={nominee}
          />
        ))}
      </>
    );
  }

  // 矩阵模式：紧凑的座位卡片，用于配置界面
  const cols = Math.min(8, Math.max(4, seats.length));

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 w-full">
      {seats.map((seat) => {
        const isDead = seat.isDead;
        const hasRole = !!seat.role;
        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          console.log('[SeatGrid matrix] Seat clicked:', seat.id, 'Selected role:', seat.role?.name);
          onSeatClick(seat);
        };
        const handleTouchEnd = (e: React.TouchEvent) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('[SeatGrid matrix] Seat touched:', seat.id, 'Selected role:', seat.role?.name);
          onSeatClick(seat);
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

