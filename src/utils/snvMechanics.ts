/**
 * 《梦殒春宵》（Sects & Violets）专属规则与判定工具库
 */
import type { Seat } from "../../app/data";

export function isGoodAlignment(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if (seat.isEvilConverted) return false;
  if (seat.isGoodConverted) return true;
  if ((seat as any).alignment === "evil") return false;
  if ((seat as any).alignment === "good") return true;
  const roleType = seat.role?.type;
  return roleType === "townsfolk" || roleType === "outsider";
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
