/**
 * 测试辅助函数
 */

import type { GameStateSnapshot } from "../src/utils/nightStateMachine";

/**
 * 创建游戏快照用于测试
 */
export function createGameSnapshot(config: {
  playerCount: number;
  script: string;
  roles: Array<{
    id: string;
    alignment: "good" | "evil";
    type: "townsfolk" | "outsider" | "minion" | "demon";
  }>;
}): GameStateSnapshot {
  const seats = config.roles.map((role, index) => ({
    id: index,
    role: {
      id: role.id,
      name: role.id,
      alignment: role.alignment,
      type: role.type,
    },
    isAlive: true,
    statusEffects: [],
    deathReason: null,
  }));

  return {
    gamePhase: "setup",
    nightCount: 0,
    seats,
    statusEffects: {},
    gameResult: null,
  };
}

/**
 * 获取角色ID对应的座位
 */
export function getSeatByRoleId(
  snapshot: GameStateSnapshot,
  roleId: string
): any | undefined {
  return snapshot.seats.find((seat) => seat.role.id === roleId);
}

/**
 * 检查座位是否存活
 */
export function isSeatAlive(
  snapshot: GameStateSnapshot,
  seatId: number
): boolean {
  const seat = snapshot.seats.find((s) => s.id === seatId);
  return seat?.isAlive ?? false;
}

/**
 * 获取所有存活座位
 */
export function getAliveSeats(snapshot: GameStateSnapshot): any[] {
  return snapshot.seats.filter((seat) => seat.isAlive);
}

/**
 * 获取所有死亡座位
 */
export function getDeadSeats(snapshot: GameStateSnapshot): any[] {
  return snapshot.seats.filter((seat) => !seat.isAlive);
}
