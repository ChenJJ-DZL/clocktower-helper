/**
 * 镇长「三人生存」特殊胜利（唯一判据入口）
 * ==================================================================
 * 官方【角色能力】：
 *   「如果只有三名玩家存活且白天没有人被处决，你的阵营获胜。
 *     如果你在夜晚即将死亡，可能会有一名其他玩家代替你死亡。」
 *
 * 官方【运作方式】：
 *   「在黄昏时，如果正好有三名玩家存活，且当天没有玩家被处决，
 *     宣布镇长所在的阵营获胜。」
 *
 * 官方【规则细节】：
 *   「虽然镇长的特殊胜利在黄昏时宣布，但镇长的特殊胜利能力触发是在白天，
 *     因此投毒者或者其他能让镇长醉酒或中毒的角色仍然会阻止镇长因为
 *     自己的能力而以特殊方式获胜。」
 *
 * 🔴 2026-10-22 补：此前全仓只有**文案与注释**（`mayor.ability.ts` 的
 *   「替死」段、`generatedRoleWakeTemplates` 的唤醒提示），
 *   **没有任何生产判据**——3 人存活 + 无人处决时游戏照常入夜。
 *   这是典型「helper 齐全、零调用点」型缺陷（见 MEMORY 铁律）。
 *
 * 判据口径：
 *   · 存活计数**排除旅行者**（官方「玩家」通常不含旅行者；与红唇女郎的
 *     `aliveNonTravelerCount` 保持同一口径）；
 *   · 镇长必须**存活**且**未中毒/醉酒**（官方规则细节明确）；
 *   · 胜方 = **镇长自己的阵营**（`isSeatEvil`，只认 `isEvilConverted`），
 *     不是固定的善良 —— 异端分子/政客等转换场景下镇长可能是邪恶。
 */

import { isSeatAlive } from "./seatAlive";
import { isSeatDisabled } from "./seatDisabled";
import { isSeatEvil, isSeatTraveler } from "./seatAlignment";

/** 判据只需要这几个字段；用宽松类型避免与 Seat 的完整定义耦合 */
export interface MayorRuleSeat {
  id?: number;
  isDead?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  roleId?: string | null;
  isPoisoned?: boolean | null;
  isDrunk?: boolean | null;
}

export interface MayorDuskWin {
  /** 胜方 = 镇长所属阵营 */
  winner: "good" | "evil";
  /** 可读胜因（写进日志 / 终局卡片） */
  reason: string;
  /** 镇长座位（0 基），便于调用方记日志 */
  mayorSeatId: number;
}

function roleIdOf(seat: MayorRuleSeat): string {
  return seat?.role?.id ?? seat?.roleId ?? "";
}

/**
 * 判定镇长「三人生存」特殊胜利是否成立。
 *
 * @param seats 当前座位表（权威真值，勿传渲染期快照）
 * @param todayExecuted 今天白天是否**真的有人被处决**（有提名但没有死亡也算「有处决」，
 *        官方判据是「没有人被处决」，而处决被免死挡下仍是一次处决）
 */
export function resolveMayorDuskWin(
  seats: MayorRuleSeat[] | null | undefined,
  todayExecuted: boolean
): MayorDuskWin | null {
  const list = seats ?? [];
  if (list.length === 0) return null;
  if (todayExecuted) return null;

  const mayor = list.find((s) => roleIdOf(s) === "mayor");
  if (!mayor) return null;
  if (!isSeatAlive(mayor)) return null;
  // 官方：醉/毒的镇长特殊胜利不生效
  if (isSeatDisabled(mayor as never)) return null;

  // 存活计数排除旅行者（国王/红唇女郎同款口径）
  const aliveCount = list.filter(
    (s) => isSeatAlive(s) && !isSeatTraveler(s as never)
  ).length;
  if (aliveCount !== 3) return null;

  const winner: "good" | "evil" = isSeatEvil(mayor as never) ? "evil" : "good";
  return {
    winner,
    reason: "镇长：仅剩三名玩家存活且今日无人被处决",
    mayorSeatId: mayor.id ?? -1,
  };
}
