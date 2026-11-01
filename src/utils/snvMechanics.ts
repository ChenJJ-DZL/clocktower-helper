/**
 * 《梦殒春宵》（Sects & Violets）专属规则与判定工具库
 */
import type { Seat } from "../../app/data";
import { applyRoleKeepingAlignment } from "./roleChangeAlignment";
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

/**
 * 取诺-达鲺两侧**最近的镇民**（顺时针 1 名 + 逆时针 1 名）。
 *
 * ✅ 2026-09-22 按**官方原文**修正：**不再跳过已死亡的镇民**
 * ------------------------------------------------------------------
 * 官方【诺-达鲺】→【角色简介】（逐字）：
 *   「在诺-达鲺顺时针和逆时针方向上最近的镇民中毒，
 *     **无论这些镇民是存活还是死亡**。……
 *     总是会有两名镇民玩家因此中毒，诺-达鲺的效果会**跳过与他相邻的非镇民角色**。」
 * ⇒ 原实现的 `!s.isDead` 过滤会把「已死亡的最近镇民」跳过去、继续往外找，
 *   导致**中毒对象错位**（本该中毒的死镇民没被标记，而更远的活镇民被误标）
 *   —— 与官方「总是会有**两名**镇民中毒」也不符（可能只标到 0~1 名）。
 * ⚠️ 注意：官方同时强调**跳过非镇民**（`role.type === "townsfolk"` 过滤要保留）。
 */
export function getNoDashiiPoisonTargets(
  noDashiiSeatId: number,
  seats: Seat[]
): number[] {
  const n = seats.length;
  if (n < 3) return [];

  const centerIdx = seats.findIndex((s) => s.id === noDashiiSeatId);
  if (centerIdx < 0) return [];

  const targets: number[] = [];

  // 顺时针：最近的镇民（**不论存活/死亡**）
  for (let i = 1; i < n; i++) {
    const s = seats[(centerIdx + i) % n];
    if (s.role?.type === "townsfolk") {
      targets.push(s.id);
      break;
    }
  }

  // 逆时针：最近的镇民（**不论存活/死亡**）
  for (let i = 1; i < n; i++) {
    const s = seats[(centerIdx - i + n) % n];
    if (s.role?.type === "townsfolk") {
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
  /**
   * 🔴 2026-11-01：**交换角色不改变阵营**。
   *   官方【理发师#3】逐字：「亡骨魔与死去的心上人交换角色。**曾经的亡骨魔现在是邪恶的心上人**」
   *   —— 换到外来者角色上，那名玩家仍然是邪恶。
   *   旧实现只做 `role: { ...seatB.role }`，而 `isSeatEvil` 的权威口径是「角色类型 + 转换标记」
   *   ⇒ 恶魔换到外来者角色上会被算成**善良**（判胜、信息类角色全线跟着错）。
   *   收口到 `utils/roleChangeAlignment`（麻脸巫婆同一缺陷共用一份实现）。
   */
  return {
    updatedSeatA: applyRoleKeepingAlignment(seatA, seatB.role as any),
    updatedSeatB: applyRoleKeepingAlignment(seatB, seatA.role as any),
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
