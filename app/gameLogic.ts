/**
 * app/gameLogic.ts
 *
 * 说明：
 * - 这是给 Jest 的“纯逻辑”测试使用的一组最小核心函数。
 * - 运行时游戏逻辑主要在 hooks（例如 `src/hooks/useGameController.ts`）中；
 *   但单测不应依赖 React hooks，因此这里提供无副作用的纯函数实现。
 */

import type { Seat } from "./data";
import { roles } from "./data";

export function initializeSeats(count: number): Seat[] {
  if (count <= 0) return [];
  return Array.from({ length: count }).map((_, idx) => ({
    id: idx,
    role: null,
    displayRole: null,
    charadeRole: null,
    isDead: false,
    hasGhostVote: true,
    isEvilConverted: false,
    isGoodConverted: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
    statuses: [],
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 1,
  }));
}

export function allPlayersHaveRoles(seats: Seat[]): boolean {
  return seats.every((s) => !!s.role);
}

export function assignRoles(seats: Seat[], roleIds: string[]): Seat[] {
  if (seats.length !== roleIds.length) {
    throw new Error(`座位数量(${seats.length})与角色数量(${roleIds.length})不匹配`);
  }

  return seats.map((s, idx) => {
    const id = roleIds[idx];
    const role = roles.find((r) => r.id === id);
    if (!role) throw new Error(`找不到角色ID: ${id}`);
    return {
      ...s,
      role,
      // Drunk：默认标记为醉酒（测试用）
      isDrunk: id === "drunk" || id === "drunk_mr" ? true : s.isDrunk,
    };
  });
}

export function killPlayer(
  seats: Seat[],
  targetId: number,
  _options?: { isNightPhase?: boolean; checkProtection?: boolean }
): Seat[] {
  return seats.map((s) => (s.id === targetId ? { ...s, isDead: true } : s));
}

export function getAlivePlayerCount(seats: Seat[]): number {
  return seats.filter((s) => !s.isDead).length;
}

export function getDeadPlayerCount(seats: Seat[]): number {
  return seats.filter((s) => s.isDead).length;
}

export function canUseAbility(seat: Seat): boolean {
  if (!seat.role) return false;
  if (seat.isDead && !seat.hasAbilityEvenDead) return false;
  return true;
}


