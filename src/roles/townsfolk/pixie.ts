import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 小精灵 (Pixie)
 * 说明：在你的首个夜晚，你会得知一个在场的镇民角色。如果你“疯狂”地证明你是该角色，当他死亡时你获得该角色的能力。
 */
export const pixie: RoleDefinition = {
  id: "pixie",
  name: "小精灵",
  type: "townsfolk",
  detailedDescription:
    '在你的首个夜晚，你会得知一个在场的镇民角色。如果你"疯狂"地证明你是该角色，当他死亡时你获得该角色的能力。\n\n**运作方式:**\n在首个夜晚里，唤醒小精灵。对其展示标记了"疯狂"的镇民角色标记（小精灵不会得知具体座位号）。让小精灵重新入睡。\n当标记了"疯狂"的玩家死亡时，若说书人判定小精灵曾"疯狂"地证明自己是该角色，小精灵获得该角色的能力，并在该角色的夜晚顺序时机被唤醒以使用能力。',
  clarifications: [
    "小精灵首夜只会得知角色，不会得知哪名玩家是这个角色。",
    "小精灵在对应的镇民死亡后获得该角色的能力，但小精灵本身的角色不会发生变化，依然是小精灵。",
    "小精灵死后失去获得的技能（除非该技能死后仍有效）。小精灵自身醉酒中毒时，继承的能力也会受影响。",
  ],
  firstNight: {
    order: 50,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (playerSeatId, _isFirstNight, context) => {
      const { seats, isActorDisabledByPoisonOrDrunk = () => false } = context;
      const selfSeat = seats.find((s) => s.id === playerSeatId);
      const isDisabled =
        selfSeat &&
        typeof isActorDisabledByPoisonOrDrunk === "function" &&
        isActorDisabledByPoisonOrDrunk(selfSeat);
      const seatNo = playerSeatId + 1;

      // 提取已记录的疯狂角色或动态计算
      const recordedRole =
        (selfSeat as any)?.pixieMadnessRoleName ||
        (selfSeat as any)?.pixieTargetRole;

      let targetRoleName = recordedRole;
      if (!targetRoleName) {
        const inPlayTownsfolk = seats.filter(
          (s) => s.role?.type === "townsfolk" && s.id !== playerSeatId
        );
        if (isDisabled) {
          targetRoleName = "洗衣妇";
        } else if (inPlayTownsfolk.length > 0) {
          targetRoleName = inPlayTownsfolk[0]?.role?.name || "未知角色";
        } else {
          targetRoleName = "厨师";
        }
      }

      return {
        wake: `唤醒${seatNo}号【小精灵】，展示角色标记告知其【${targetRoleName}】在场。小精灵不知道具体座位号；需"疯狂"地证明自己是该角色，当该玩家死亡时小精灵获得其能力。`,
        instruction: `展示【${targetRoleName}】角色标记`,
        close: "让小精灵闭眼入睡",
      };
    },
  },
};
