import { RoleDefinition, NightActionContext, NightActionResult } from "../../types/roleDefinition";

/**
 * 水手 (Sailor)
 * 说明：每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。你不会死亡。
 */
export const sailor: RoleDefinition = {
  id: "sailor",
  name: "水手",
  type: "townsfolk",
  detailedDescription: `【背景故事】
“你们随便谁来我都能把他喝到桌子底下去！说你呢！那个话痨！敢来和我喝一杯么？不来？那你呢，老太婆？你以前喝过老麦基利的加香料朗姆酒吗？保证能让你喝成个真男人！上船咯，噢耶！”
【角色能力】
每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。
你不会死亡。
【角色简介】
水手要么自己醉酒，要么让别人醉酒。只要水手是清醒状态，就不会死亡。
- 每个夜晚，水手需要选择一名玩家，该玩家可能会醉酒。
- 如果水手选择了自己，他失去自己的“不会死亡”能力，直到恢复清醒为止。
- 如果水手不小心选择了已死亡的玩家，说书人应提醒他重新选择。
- 如果水手选择了其他玩家，由说书人来选择哪名玩家将会醉酒。如果水手选择了一个镇民，说书人通常会让该镇民醉酒，但如果选择了外来者、爪牙或是恶魔，那么说书人通常会让水手自己醉酒。
- 在水手清醒时，他不会死亡，即使水手还没在夜晚被唤醒。
【范例】
> 范例: 水手选择了驱魔人，于是说书人决定让驱魔人醉酒。在这个夜晚，水手被沙巴洛斯攻击。水手依然存活。在下一个白天，水手被处决，但依然存活。
【运作方式】
每个夜晚，唤醒水手。让水手指向任意一名存活玩家。让水手重新入睡。水手或他选择的玩家两者之一会进入醉酒状态——将“醉酒”提示标记放置到该玩家的角色标记旁。
如果清醒的水手将要死亡，他会依然存活。如果清醒的水手被处决，宣布该玩家被处决但依然存活。（不要说明原因。）
【提示标记】
- 醉酒
放置时机：在水手夜晚行动并选择了玩家后。
放置条件：由说书人来选择水手醉酒还是水手选择的玩家醉酒，并在对应角色标记旁放置醉酒提示标记。水手无法选择已死亡的玩家。若此时水手醉酒中毒，不放置该标记。
移除时机：在黄昏时。
【角色信息】
- 英文名：Sailor
- 所属剧本：黯月初升
- 角色类型：镇民
- 角色能力类型：免死、醉酒`,
  night: {
    order: 25,
    target: {
      count: { min: 1, max: 1 },
      canSelect: () => true,
    },
    dialog: (playerSeatId: number) => ({
      wake: `唤醒${playerSeatId + 1}号玩家（水手）。`,
      instruction: "请指向一名存活玩家（包括你自己）。你或他之一会醉酒至下个黄昏。",
      close: `${playerSeatId + 1}号玩家（水手），请闭眼。`,
    }),
    handler: (context: NightActionContext): NightActionResult | null => {
      const { seats, targets, selfId } = context;
      if (targets.length === 0) return { updates: [] };

      const targetId = targets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      const sailorSeat = seats.find(s => s.id === selfId);

      if (!targetSeat || !sailorSeat) return { updates: [] };

      // 逻辑：如果目标是镇民，则目标醉酒；否则自身醉酒。
      // 这是说书人在自动化环境下的典型推荐选择。
      const targetIsTownsfolk = targetSeat.role?.type === 'townsfolk';
      const drunkId = targetIsTownsfolk ? targetId : selfId;
      const drunkSeat = seats.find(s => s.id === drunkId);

      const updates = [];
      if (drunkSeat) {
        // 清理旧的水手醉酒标记
        const details = (drunkSeat.statusDetails || []).filter(d => !d.includes('水手致醉'));
        const statuses = (drunkSeat.statuses || []).filter(s => s.effect !== 'Drunk' || s.duration !== '黄昏');

        updates.push({
          id: drunkId,
          statusDetails: [...details, '水手致醉（黄昏清除）'],
          statuses: [...statuses, { effect: 'Drunk', duration: '黄昏' }]
        });
      }

      return {
        updates,
        logs: {
          privateLog: `🍷 水手选择了 ${targetId + 1}号，导致 ${drunkId + 1}号 醉酒至下个黄昏。`
        }
      };
    }
  }
};
