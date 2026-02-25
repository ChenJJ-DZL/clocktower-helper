import { RoleDefinition } from "../../types/roleDefinition";
import { Seat } from "../../types/game";
import { getRegistration, getRandom } from "../../utils/gameRules";

/**
 * 筑梦师 (Dreamer)
 *
 * 每个夜晚，你要选择除你及旅行者以外的一名玩家：
 * - 你会得知一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色；
 * - 具体哪两个角色、谁真谁假，以及在涡流 / 醉酒 / 中毒下如何扭曲，由统一的 `nightLogic` 信息管线处理；
 * - 这里仅负责夜晚顺位、可选目标限制与 UI 提示。
 */
export const dreamer: RoleDefinition = {
  id: "dreamer",
  name: "筑梦师",
  type: "townsfolk",

  night: {
    order: (isFirstNight) => isFirstNight ? 8 : 8,

    target: {
      count: {
        // 每晚必须选择 1 名目标（除自己与旅行者外）
        min: 1,
        max: 1,
      },
      canSelect: (target: Seat, self: Seat) => {
        if (!target.role) return false;
        if (target.id === self.id) return false;
        if (target.role.type === 'traveler') return false;
        return true;
      },
    },

    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（筑梦师）。`,
        instruction: "请选择除你及旅行者以外的一名玩家，说书人会告知你：一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色。",
        close: `${playerSeatId + 1}号玩家（筑梦师），请闭眼。`,
      };
    },

    // 真正的信息生成与真假角色对由 nightLogic 处理，这里只做日志记录
    handler: (context) => {
      const { targets, seats, roles, selfId } = context;
      if (targets.length === 0) return { updates: [], logs: { privateLog: "筑梦师未选择目标" } };

      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || !targetSeat.role) return { updates: [], logs: { privateLog: "无效目标" } };

      const registrant = getRegistration(targetSeat, { id: 'dreamer' } as any);
      const isGoodReg = registrant.alignment === 'Good';

      const goodRoles = roles!.filter(r => r.type === 'townsfolk' || r.type === 'outsider');
      const evilRoles = roles!.filter(r => r.type === 'minion' || r.type === 'demon');

      let roleA, roleB;

      if (isGoodReg) {
        // 目标注册为善良，给一个正确的善良角色和一个虚假的邪恶角色
        roleA = targetSeat.role;
        roleB = getRandom(evilRoles);
      } else {
        // 目标注册为邪恶，给一个虚假的善良角色和一个正确的邪恶角色
        roleA = getRandom(goodRoles);
        roleB = targetSeat.role;
      }

      // 保证 roleA 总是善良，roleB 总是邪恶（即便其中一个是真实的）
      // 如果目标是隐士（注册为邪恶），则 roleA 是随机好人，roleB 是隐士
      // 如果目标是间谍（注册为善良），则 roleA 是间谍，roleB 是随机坏人

      const resRoleA = roles!.find(r => r.id === (isGoodReg ? roleA.id : roleA.id))!;
      const resRoleB = roles!.find(r => r.id === (isGoodReg ? roleB.id : roleB.id))!;

      return {
        updates: [],
        logs: {
          privateLog: `筑梦师选择了${targetId + 1}号位，得知：${resRoleA.name}, ${resRoleB.name}`,
          secretInfo: `得知：${resRoleA.name}, ${resRoleB.name}`
        },
        modal: {
          type: 'DREAMER_RESULT',
          data: {
            roleA: resRoleA,
            roleB: resRoleB
          }
        }
      };
    },
  },
};
