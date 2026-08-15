/**
 * 戏子（Actor）全局机制工具（纯函数，供判胜流程/初始设置/测试共用）
 *
 * 【规则】"所有戏子互相认识。不论在场的戏子数量多少或存活与否，胜负结果会被对调。
 *   [所有善良玩家都是戏子]"
 *
 * - hasActorInGame：场上是否存在戏子（不论死活、不论数量）。
 * - applyActorVictoryFlip：判定结果调换（善良↔邪恶）。
 * - actorSetupRoles：初始设置——若戏子作为出场角色，把所有其他善良角色
 *   （镇民/外来者）替换为戏子，数量不变。
 */
import type { Seat } from "../../app/data";

/** 场上是否有戏子（不论死活） */
export function hasActorInGame(seats: Seat[]): boolean {
  return seats.some((s) => s.role?.id === "actor");
}

/** 戏子胜负对调：有戏子在场时调换判定结果 */
export function applyActorVictoryFlip(
  winner: "good" | "evil" | undefined | null,
  seats: Seat[]
): "good" | "evil" | undefined | null {
  if (!winner) return winner;
  if (!hasActorInGame(seats)) return winner;
  return winner === "good" ? "evil" : "good";
}

/**
 * 初始设置：若戏子作为出场角色，把所有其他善良角色（非恶魔/非爪牙）替换为戏子。
 * 返回新的座位列表（不修改原数组）。
 */
export function actorSetupRoles(seats: Seat[]): Seat[] {
  const hasActor = seats.some((s) => s.role?.id === "actor");
  if (!hasActor) return seats;
  return seats.map((s) => {
    const t = s.role?.type;
    // 恶魔/爪牙保持邪恶身份；其余（镇民/外来者/未知）→ 戏子
    if (t === "demon" || t === "minion") return s;
    return {
      ...s,
      role: { ...(s.role as any), id: "actor", name: "戏子", type: "townsfolk" },
    };
  });
}
