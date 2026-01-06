"use client";

import React from "react";
import { Seat } from "../../../../app/data";
import { NightInfoResult } from "../../../types/game";
import { SeatNode } from "../../SeatNode";
import { getSeatPosition } from "../../../utils/gameRules";

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
  } = props;

  return (
    <>
      {seats.map((seat, index) => {
        const position = getSeatPosition(index, seats.length, isPortrait);
        
        return (
          <div
            key={seat.id}
            className="absolute"
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <SeatNode
              seat={seat}
              index={index}
              seats={seats}
              isPortrait={isPortrait}
              seatScale={seatScale}
              nightInfo={nightInfo}
              selectedActionTargets={selectedActionTargets}
              longPressingSeats={longPressingSeats}
              onSeatClick={(id) => {
                const clickedSeat = seats.find(s => s.id === id);
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
            />
          </div>
        );
      })}
    </>
  );
}

