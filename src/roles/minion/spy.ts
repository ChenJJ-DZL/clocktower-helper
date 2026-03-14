import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 间谍 (Spy)
 * 每晚查看魔典（所有真实身份）和完整行动日志
 */
export const spy: RoleDefinition = {
  id: "spy",
  name: "间谍",
  type: "minion",
  detailedDescription:
    "每个夜晚，你能查看魔典。你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。\n\n**运作方式:**\n每个夜晚，唤醒间谍并让他按自己意愿的时长来查看魔典。让间谍重新入睡。每当因游戏规则或角色能力的效果要探查或影响玩家的阵营或角色，且间谍因此被选中为目标时，由说书人决定间谍被当作哪种角色和哪种阵营。\n\n**提示与技巧:**\n- 在游戏开始你将知道所有信息，尽可能记住他们并提供给队友！使用这些信息帮助邪恶阵营队友挑选善良角色做伪装，以及消灭高优先级的目标。\n- 在魔典中，你不止能够看到谁是谁，还能看到说书人在他们角色标记旁放置的提示标记。\n- 你几乎总是会被其他角色当作是善良玩家，比如共情者，厨师以及送葬者。基于这一点，你能比其他邪恶阵营玩家更容易地获取到善良阵营玩家的信任。\n- 间谍死后仍然能够查看魔典（如果剧本本身规则并未说明死后失去能力），并且可以继续被当作善良角色。",
  clarifications: [
    "间谍在被当作特定的镇民或外来者角色时，不会获得这一角色的能力。",
    "间谍的互动干扰能力中，阵营与角色是独立判断的。如果有既能探查阵营也能探查角色的能力，间谍有可能被当作“善良的间谍”或者是“邪恶的镇民”。",
    "相克规则：罂粟种植者：如果罂粟种植者在场，直到其死亡前间谍无法查看魔典。食人魔：间谍必定被食人魔当作邪恶阵营。",
  ],

  // 首夜和后续夜晚都行动
  night: {
    order: 45,

    target: {
      count: {
        min: 0,
        max: 0,
      },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（间谍）。`,
        instruction: "查看魔法书",
        close: `${playerSeatId + 1}号玩家（间谍），请闭眼。`,
      };
    },

    handler: (context) => {
      // 触发间谍查看魔典的弹窗
      return {
        updates: [],
        modal: {
          type: "SPY_GRIMOIRE",
          data: null,
        },
        logs: {
          privateLog: `间谍（${context.selfId + 1}号）已查看魔典`,
        },
      };
    },
  },
};
