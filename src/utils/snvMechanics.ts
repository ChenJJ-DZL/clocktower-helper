/**
 * 《梦殒春宵》（Sects & Violets）专属规则与判定工具库
 */
import type { Seat } from "../../app/data";
import { isSeatGood } from "./seatAlignment";

/**
 * @deprecated 用 `isSeatGood`（`utils/seatAlignment`）。
 * 保留旧名仅为兼容调用点；实现已转发到全项目唯一权威。
 */
export function isGoodAlignment(seat: Seat | undefined | null): boolean {
  return isSeatGood(seat);
}

export function calculateClockmakerDistance(seats: Seat[]): number {
  const n = seats.length;
  if (n === 0) return 0;

  const demons = seats.filter(
    (s) =>
      s.role?.type === "demon" ||
      s.role?.id === "summoner" ||
      (s as any).isDemonSuccessor === true
  );
  const minions = seats.filter((s) => s.role?.type === "minion");

  if (demons.length === 0 || minions.length === 0) {
    return 0;
  }

  let minDistance = n;
  for (const d of demons) {
    const dIdx = seats.findIndex((s) => s.id === d.id);
    for (const m of minions) {
      if (d.id === m.id) continue;
      const mIdx = seats.findIndex((s) => s.id === m.id);
      const diff = Math.abs(dIdx - mIdx);
      const circularDist = Math.min(diff, n - diff);
      if (circularDist < minDistance) {
        minDistance = circularDist;
      }
    }
  }

  return minDistance;
}

export function getNoDashiiPoisonTargets(
  noDashiiSeatId: number,
  seats: Seat[]
): number[] {
  const n = seats.length;
  if (n < 3) return [];

  const centerIdx = seats.findIndex((s) => s.id === noDashiiSeatId);
  if (centerIdx < 0) return [];

  const targets: number[] = [];

  for (let i = 1; i < n; i++) {
    const s = seats[(centerIdx + i) % n];
    if (!s.isDead && s.role?.type === "townsfolk") {
      targets.push(s.id);
      break;
    }
  }

  for (let i = 1; i < n; i++) {
    const s = seats[(centerIdx - i + n) % n];
    if (!s.isDead && s.role?.type === "townsfolk") {
      if (!targets.includes(s.id)) {
        targets.push(s.id);
      }
      break;
    }
  }

  return targets;
}

export function checkKlutzSelection(
  chosenSeat: Seat
): { evilChosen: boolean; goodWins: boolean } {
  const isEvil = !isGoodAlignment(chosenSeat);
  return {
    evilChosen: isEvil,
    goodWins: !isEvil,
  };
}

export function executeBarberSwap(
  seatA: Seat,
  seatB: Seat
): { updatedSeatA: Seat; updatedSeatB: Seat } {
  const updatedA: Seat = {
    ...seatA,
    role: { ...seatB.role } as any,
  };
  const updatedB: Seat = {
    ...seatB,
    role: { ...seatA.role } as any,
  };
  return {
    updatedSeatA: updatedA,
    updatedSeatB: updatedB,
  };
}

export function checkWitchCurseOnNomination(
  nominatorSeat: Seat,
  aliveCount: number,
  cursedSeatIds: number[]
): { shouldDie: boolean } {
  if (aliveCount <= 3) {
    return { shouldDie: false };
  }
  const isCursed =
    cursedSeatIds.includes(nominatorSeat.id) ||
    nominatorSeat.statusEffects?.some(
      (e: any) => e.type === "cursed" || e.source === "witch"
    );
  return {
    shouldDie: !!isCursed,
  };
}
