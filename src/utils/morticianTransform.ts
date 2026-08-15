/**
 * 入殓师（Mortician）转化机制工具（纯函数，供 UI 处决流程与测试共用）
 *
 * 【规则】"如果你提名了恶魔且他死于这次处决，你会变成那个邪恶的恶魔。
 *   当剩余存活玩家小于等于四人时（旅行者除外），你失去能力。"
 *
 * - 入殓师提名恶魔且恶魔死于处决：
 *   - 处决后存活玩家数（旅行者除外）≥ 4 → 入殓师变为邪恶的该恶魔，游戏继续
 *     （场上仍有存活恶魔 = 入殓师自己，判胜逻辑自然不触发，游戏如同恶魔未死）。
 *   - 处决后存活玩家数（旅行者除外）< 4 → 入殓师失去能力，不转化，善良阵营获胜。
 * - 入殓师失去能力时不计算旅行者。
 */
import type { Seat } from "../../app/data";

export interface MorticianCheckResult {
  transformed: boolean;
  reason: string;
}

/** 存活玩家数（旅行者除外） */
export function countAliveNonTraveler(seats: Seat[]): number {
  return seats.filter((s) => !s.isDead && s.role?.type !== "traveler").length;
}

/**
 * 判定入殓师是否应转化（在"恶魔已死于处决"后调用）
 *
 * @param seatsAfterExecution 处决生效后的座位列表（恶魔已死亡）
 * @param executedSeatId      被处决的玩家 id（应为恶魔）
 * @param nominatorId         发起提名的玩家 id（可能为 null）
 */
export function shouldMorticianTransform(
  seatsAfterExecution: Seat[],
  executedSeatId: number,
  nominatorId: number | null | undefined
): MorticianCheckResult {
  const executed = seatsAfterExecution.find((s) => s.id === executedSeatId);
  if (!executed) return { transformed: false, reason: "被处决玩家不存在" };

  const isDemon =
    executed.role?.type === "demon" || executed.isDemonSuccessor === true;
  if (!isDemon) {
    return { transformed: false, reason: "被处决者不是恶魔" };
  }

  const nominator = seatsAfterExecution.find((s) => s.id === nominatorId);
  if (!nominator || nominator.role?.id !== "mortician") {
    return { transformed: false, reason: "提名者不是入殓师" };
  }
  if (nominator.isDead) {
    return { transformed: false, reason: "入殓师已死亡" };
  }

  // 处决后存活玩家数（旅行者除外）≥ 4 → 转化（对应处决前 ≥ 5）
  if (countAliveNonTraveler(seatsAfterExecution) < 4) {
    return {
      transformed: false,
      reason: "处决后存活玩家（旅行者除外）少于 4 人，入殓师失去能力",
    };
  }

  return { transformed: true, reason: "入殓师变为邪恶的恶魔，游戏继续" };
}

/** 执行转化：入殓师座位变为被处决恶魔的角色（并标记为邪恶转化） */
export function transformMorticianToDemon(
  seats: Seat[],
  morticianId: number,
  demonRoleId: string
): Seat[] {
  return seats.map((s) =>
    s.id === morticianId
      ? {
          ...s,
          role: { ...(s.role as any), id: demonRoleId, type: "demon" },
          isEvilConverted: true,
          statuses: [
            ...(s.statuses ?? []),
            { effect: "变为恶魔", duration: "永久" },
          ],
          statusDetails: [
            ...(s.statusDetails ?? []),
            "入殓师变为恶魔（游戏继续）",
          ],
        }
      : s
  );
}
