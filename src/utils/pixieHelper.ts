/**
 * 小精灵 (Pixie) 辅助逻辑
 *
 * 官方 Wiki 规则：
 * "在你的首个夜晚，你会得知一个在场的镇民角色。如果你"疯狂"地证明你是该角色，当他死亡时你获得该角色的能力。"
 *
 * 核心机制：
 * 1. 当临摹的镇民角色死亡时，小精灵的角色依然保持为小精灵（role.id === "pixie"），
 *    小精灵获得该镇民的能力（pixieCopiedRole / pixieHasAbility / acquiredAbilities）。
 * 2. 状态影响：小精灵死后失去技能；小精灵中毒/醉酒或涡流在场时，能力受干扰。
 */

import type { Seat } from "../../app/data";

/**
 * 检查并更新场上小精灵的能力激活状态
 * 当临摹的在场镇民死亡时，自动激活小精灵的能力；
 * 若说书人明确取消了疯狂证明，则不激活/撤销能力。
 */
export function checkAndUpdatePixieAbility(
  seats: Seat[],
  addLog?: (msg: string) => void
): Seat[] {
  let changed = false;

  const nextSeats = seats.map((seat) => {
    if (seat.role?.id !== "pixie" || seat.isDead) {
      return seat;
    }

    const seatAny = seat as any;
    const madnessRoleId =
      seatAny.pixieMadnessRoleId ||
      (seat.statusDetails
        ?.find((s) => s.startsWith("伪装身份:"))
        ?.replace("伪装身份:", "")
        ? seats.find(
            (other) =>
              other.role?.name ===
              seat.statusDetails
                ?.find((s) => s.startsWith("伪装身份:"))
                ?.replace("伪装身份:", "")
          )?.role?.id
        : undefined);

    if (!madnessRoleId) return seat;

    // 检查该临摹镇民在场玩家是否死亡
    const targetSeat = seats.find(
      (other) => other.role?.id === madnessRoleId && other.id !== seat.id
    );
    const isTargetDead = targetSeat?.isDead === true;

    // 说书人是否允许疯狂（默认若未显式设为 false 则在死亡时自动认可）
    const isMadnessAllowed = seatAny.pixieMadnessConfirmed !== false;

    const shouldHaveAbility = isTargetDead && isMadnessAllowed;
    const currentHasAbility = !!seatAny.pixieHasAbility;

    if (shouldHaveAbility && !currentHasAbility) {
      changed = true;
      const roleName =
        seatAny.pixieMadnessRoleName || targetSeat?.role?.name || madnessRoleId;
      const details = (seat.statusDetails || []).filter(
        (st: string) =>
          st !== "能力已激活" && !st.startsWith("获得死去镇民能力:")
      );

      if (addLog) {
        addLog(
          `🎭 【小精灵】${seat.id + 1}号得知的【${roleName}】已死亡，小精灵获得其能力！`
        );
      }

      return {
        ...seat,
        pixieCopiedRole: madnessRoleId,
        pixieHasAbility: true,
        pixieMadnessConfirmed: true,
        acquiredAbilities: [
          ...((seatAny.acquiredAbilities as string[]) ?? []),
          ...(seatAny.acquiredAbilities?.includes?.(madnessRoleId)
            ? []
            : [madnessRoleId]),
        ],
        statusDetails: [
          ...details,
          "能力已激活",
          `获得死去镇民能力:${roleName}`,
        ],
      } as Seat;
    } else if (!shouldHaveAbility && currentHasAbility) {
      // 撤销能力（如说书人取消了疯狂或被复活）
      changed = true;
      const details = (seat.statusDetails || []).filter(
        (st: string) =>
          st !== "能力已激活" && !st.startsWith("获得死去镇民能力:")
      );
      return {
        ...seat,
        pixieCopiedRole: undefined,
        pixieHasAbility: false,
        acquiredAbilities: (
          (seatAny.acquiredAbilities as string[]) || []
        ).filter((r) => r !== madnessRoleId),
        statusDetails: details,
      } as Seat;
    }

    return seat;
  });

  return changed ? nextSeats : seats;
}
