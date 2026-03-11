import type { Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";

export interface SeatNodeProps {
    seat: Seat;
    index: number;
    seats: Seat[];
    isPortrait: boolean;
    seatScale: number;
    nightInfo: NightInfoResult | null;
    selectedActionTargets: number[];
    longPressingSeats: Set<number>;
    onSeatClick: (id: number) => void;
    onContextMenu: (e: React.MouseEvent, seatId: number) => void;
    onTouchStart: (e: React.TouchEvent, seatId: number) => void;
    onTouchEnd: (e: React.TouchEvent, seatId: number) => void;
    onTouchMove: (e: React.TouchEvent, seatId: number) => void;
    setSeatRef: (id: number, el: HTMLDivElement | null) => void;
    getSeatPosition: (index: number, total?: number, isPortrait?: boolean) => { x: string; y: string };
    getDisplayRoleType: (seat: Seat) => string | null;
    typeColors: Record<string, string>;
    // Dusk phase selection indicators
    nominator?: number | null;
    nominee?: number | null;
    voteThreshold?: number;
    aliveCoreCount?: number;
    topVotes?: number[];
    isTie?: boolean;
    seatNote?: string;
}
