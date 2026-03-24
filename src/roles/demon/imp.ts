import type { Seat } from "../../types/game";
import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 小恶魔 (Imp)
 * 首夜得知爪牙，非首夜选人杀害
 */
export const imp: RoleDefinition = {
  id: "imp",
  name: "小恶魔",
  type: "demon",
  detailedDescription:
    "每个夜晚*，你要选择一名玩家：他死亡。如果你以这种方式自杀，一名爪牙会变成小恶魔。\n\n**运作方式:**\n除首个夜晚以外的每个夜晚，唤醒小恶魔。让小恶魔指向任意一名玩家。让小恶魔重新入睡。被选择的玩家死亡。如果小恶魔选择在夜里自杀，用多出来的小恶魔标记替换一名存活的爪牙玩家的角色标记，让那名玩家的角色改变为小恶魔。唤醒新的小恶魔，向他展示“你是”信息标记，然后向他展示小恶魔角色标记。\n在黎明时，宣布有哪名玩家在夜晚死去。（不要说明死亡原因。）\n\n**提示与技巧:**\n- 努力活过白天。就算场上有三名爪牙，你也没法保证红唇女郎在场。\n- 如果你被怀疑了，在晚上自杀永远可以作为选择之一。杀死自己并且将恶魔血脉传递给一名更受信任的爪牙虽然会让你失去继续投票的权利，但让场上一直有恶魔存活更加重要。\n- 你的爪牙就是被用来牺牲的马前卒！\n- 选择攻击目标的时候，你通常希望尽早选那些强大、棘手、能够获取信息的镇民。有些时候，你也可以故意留一个这样的镇民，让他一直活到最后一天，这样也会让其他人怀疑他的真实角色。\n- 注意在最后一天留下比你看起来嫌疑更大的人！\n- 如果你不想在晚上杀任何人，选择一个已经死亡的玩家（空刀）能伪装成有人受到保护。\n- 确保你的新爪牙明白他变成了恶魔的事实，私下要早作沟通。",
  clarifications: [
    "由于小恶魔的能力描述是“一名爪牙会变成小恶魔”，所以在自杀后，必须选择一名*存活的爪牙*玩家变为恶魔。",
    "变成新小恶魔的爪牙会在当晚被唤醒以告知身份变化，但是无法在当晚接着杀人。",
    "如果小恶魔选择攻击一名已死亡的玩家（如果需要的话），是允许的，虽然会导致“空刀”但是可能帮助小恶魔伪装成士兵或僧侣被攻击等情形。",
  ],

  // 首夜行动：认队友，不需要选择目标
  firstNight: {
    order: 2,

    target: {
      count: {
        min: 0,
        max: 0,
      },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
        instruction: "查看爪牙与不在场角色信息（受罂粟种植者影响）",
        close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
      };
    },

    handler: (context) => {
      const { seats, poppyGrowerDead, selfId } = context;

      const poppyGrower = seats.find((s) => s.role?.id === "poppy_grower");
      const shouldHideMinions =
        poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

      if (shouldHideMinions) {
        return {
          updates: [],
          logs: {
            privateLog: `小恶魔（${selfId + 1}号）：因罂粟种植者在场，未告知爪牙信息`,
          },
        };
      }

      const minions = seats
        .filter((s) => s.role?.type === "minion" && s.id !== selfId)
        .map((s) => `${s.id + 1}号`);
      return {
        updates: [],
        logs: {
          privateLog: `小恶魔（${selfId + 1}号）得知爪牙：${minions.length > 0 ? minions.join("、") : "无"}`,
        },
      };
    },
  },

  // 后续夜晚行动：选择一名玩家杀害
  night: {
    order: 20,

    target: {
      count: {
        min: 1,
        max: 1,
      },

      canSelect: (
        _target: Seat,
        _self: Seat,
        _allSeats: Seat[],
        _selectedTargets: number[]
      ) => {
        // 可以选择任何人（包括自己）
        return true;
      },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（小恶魔）。`,
        instruction: "选择一名玩家杀害",
        close: `${playerSeatId + 1}号玩家（小恶魔），请闭眼。`,
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `小恶魔（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);
      const isTargetProtected =
        targetSeat?.statuses?.some((s) => s.effect === "Protected") ||
        targetSeat?.isProtected;

      // 如果目标被僧侣保护，攻击无效
      if (isTargetProtected) {
        return {
          updates: [],
          logs: {
            privateLog: `小恶魔（${selfId + 1}号）攻击了 ${targetId + 1}号玩家，但目标被僧侣保护，攻击无效`,
          },
        };
      }

      // 注意：实际的死亡逻辑和属性变更（如 isDead）应该在这里返回
      // 如果自杀，则 targetId === selfId
      const updates: Array<Partial<Seat> & { id: number }> = [
        {
          id: targetId,
          isDead: true,
          // 这里可以添加更多死亡相关的标记，但核心逻辑在 handlePostDeathTriggers
        },
      ];

      return {
        updates,
        logs: {
          privateLog: `小恶魔（${selfId + 1}号）攻击了 ${targetId + 1}号玩家${targetId === selfId ? "（自杀传位）" : ""}`,
        },
      };
    },
  },
};
