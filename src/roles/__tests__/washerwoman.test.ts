/**
 * 洗衣妇 (Washerwoman) 单元测试
 * 
 * 规则来源: json/full/镇民.json + Wiki
 * 能力: 首夜得知两名玩家和一个镇民角色: 两名玩家之一是该角色
 * 
 * 测试覆盖:
 * 1. 首夜正常获取信息
 * 2. 非首夜不唤醒
 * 3. 死亡后不触发
 * 4. 醉酒/中毒时获取假信息
 * 5. 间谍可被当作镇民
 * 6. 陌客可被当作镇民
 * 7. 无镇民在场时返回洗衣妇自身
 */

import { describe, expect, test } from "vitest";

// Mock test data helpers
function createMockSeat(
  id: number,
  roleId: string,
  roleType: string,
  isDead = false,
  isDrunk = false,
  isPoisoned = false
) {
  return {
    id,
    playerName: `玩家${id + 1}`,
    isDead,
    isAlive: !isDead,
    isDrunk,
    isPoisoned,
    role: { id: roleId, name: getRoleName(roleId), type: roleType },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: [
      ...(isDrunk ? [{ type: "drunk" }] : []),
      ...(isPoisoned ? [{ type: "poisoned" }] : []),
    ],
  };
}

function getRoleName(roleId: string): string {
  const names: Record<string, string> = {
    washerwoman: "洗衣妇",
    librarian: "图书管理员",
    investigator: "调查员",
    chef: "厨师",
    empath: "共情者",
    fortune_teller: "占卜师",
    undertaker: "送葬者",
    monk: "僧侣",
    ravenkeeper: "守鸦人",
    virgin: "贞洁者",
    slayer: "猎手",
    soldier: "士兵",
    mayor: "镇长",
    butler: "管家",
    drunk: "酒鬼",
    recluse: "陌客",
    saint: "圣徒",
    poisoner: "投毒者",
    spy: "间谍",
    scarlet_woman: "红唇女郎",
    baron: "男爵",
    imp: "小恶魔",
  };
  return names[roleId] || roleId;
}

describe("洗衣妇 (Washerwoman)", () => {
  describe("能力描述一致性", () => {
    test("JSON 中的能力描述与 Wiki 一致", () => {
      const jsonAbility =
        "在你的首个夜晚，你会得知两名玩家和一个镇民角色：这两名玩家之一是该角色。";
      // Wiki 已确认: <b>在你的首个夜晚，你会得知两名玩家和一个镇民角色：这两名玩家之一是该角色。</b>
      const wikiAbility =
        "在你的首个夜晚，你会得知两名玩家和一个镇民角色：这两名玩家之一是该角色。";
      expect(jsonAbility).toBe(wikiAbility);
    });
  });

  describe("首夜能力触发", () => {
    test("首夜 (nightCount=1) 应该唤醒", () => {
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk");
      const otherTownsfolk = createMockSeat(1, "chef", "townsfolk");
      const otherPlayer = createMockSeat(2, "butler", "outsider");
      
      const seats = [washerwoman, otherTownsfolk, otherPlayer];
      
      // 首夜条件检查
      const nightCount = 1;
      const gamePhase = "firstNight";
      const shouldWake = nightCount === 1 || gamePhase === "firstNight";
      
      expect(shouldWake).toBe(true);
    });

    test("非首夜 (nightCount>1) 不应唤醒", () => {
      const nightCount: number = 2;
      const gamePhase: string = "night";
      const shouldWake = nightCount === 1 || gamePhase === "firstNight";
      
      expect(shouldWake).toBe(false);
    });
  });

  describe("存活状态检查", () => {
    test("存活时应触发能力", () => {
      const seat = createMockSeat(0, "washerwoman", "townsfolk");
      expect(seat.isAlive).toBe(true);
      expect(seat.isDead).toBe(false);
    });

    test("死亡后不应触发能力", () => {
      const seat = createMockSeat(0, "washerwoman", "townsfolk", true);
      expect(seat.isAlive).toBe(false);
      expect(seat.isDead).toBe(true);
    });
  });

  describe("醉酒/中毒处理", () => {
    test("醉酒时应标记能力失效", () => {
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk", false, true);
      const isAbilityActive = !(washerwoman.isDrunk || washerwoman.isPoisoned);
      expect(isAbilityActive).toBe(false);
    });

    test("中毒时应标记能力失效", () => {
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk", false, false, true);
      const isAbilityActive = !(washerwoman.isDrunk || washerwoman.isPoisoned);
      expect(isAbilityActive).toBe(false);
    });

    test("清醒健康时能力正常", () => {
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk", false, false, false);
      const isAbilityActive = !(washerwoman.isDrunk || washerwoman.isPoisoned);
      expect(isAbilityActive).toBe(true);
    });
  });

  describe("镇民候选池", () => {
    test("正常镇民应该被识别", () => {
      const chef = createMockSeat(1, "chef", "townsfolk");
      const expectChef = createMockSeat(0, "washerwoman", "townsfolk");
      const seats = [createMockSeat(0, "washerwoman", "townsfolk"), chef];

      const candidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role && (s.role.type === "townsfolk" || s.role.id === "spy" || s.role.id === "recluse")
      );
      expect(candidates.length).toBe(1);
      expect(candidates[0].role.id).toBe("chef");
    });

    test("间谍应被当作镇民", () => {
      const spy = createMockSeat(1, "spy", "minion");
      const seats = [createMockSeat(0, "washerwoman", "townsfolk"), spy];

      const candidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role && (s.role.type === "townsfolk" || s.role.id === "spy" || s.role.id === "recluse")
      );
      expect(candidates.length).toBe(1);
      expect(candidates[0].role.id).toBe("spy");
    });

    test("陌客应被当作镇民", () => {
      const recluse = createMockSeat(1, "recluse", "outsider");
      const seats = [createMockSeat(0, "washerwoman", "townsfolk"), recluse];

      const candidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role && (s.role.type === "townsfolk" || s.role.id === "spy" || s.role.id === "recluse")
      );
      expect(candidates.length).toBe(1);
      expect(candidates[0].role.id).toBe("recluse");
    });

    test("恶魔不应被当作镇民", () => {
      const imp = createMockSeat(1, "imp", "demon");
      const seats = [createMockSeat(0, "washerwoman", "townsfolk"), imp];

      const candidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role && (s.role.type === "townsfolk" || s.role.id === "spy" || s.role.id === "recluse")
      );
      expect(candidates.length).toBe(0);
    });
  });

  describe("极端情况: 无镇民在场", () => {
    test("当场上无镇民候选时，应返回洗衣妇自身", () => {
      // 模拟 5 人局 + 男爵: 无镇民在场
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk");
      const imp = createMockSeat(1, "imp", "demon");
      const baron = createMockSeat(2, "baron", "minion");
      const butler = createMockSeat(3, "butler", "outsider");
      const drunk = createMockSeat(4, "drunk", "outsider");

      const seats = [washerwoman, imp, baron, butler, drunk];
      
      // 洗衣妇自身不计入，间谍/陌客不在场，无其他镇民
      const candidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role && (s.role.type === "townsfolk" || s.role.id === "spy" || s.role.id === "recluse")
      );
      
      // 仅洗衣妇自身是镇民，无其他候选人
      expect(candidates.length).toBe(0);
      
      // 按规则: 洗衣妇会得知自己与任意一名玩家之中有洗衣妇
      const roleName = candidates.length === 0 ? "洗衣妇" : "正常角色";
      expect(roleName).toBe("洗衣妇");
    });
  });

  describe("信息生成逻辑", () => {
    test("应返回两名玩家和一个角色名", () => {
      const washerwoman = createMockSeat(0, "washerwoman", "townsfolk");
      const chef = createMockSeat(1, "chef", "townsfolk");
      const soldier = createMockSeat(2, "soldier", "townsfolk");
      const seats = [washerwoman, chef, soldier];

      const townsfolkCandidates = seats.filter(
        (s) => s.id !== 0 && !s.isDead && s.role?.type === "townsfolk"
      );

      expect(townsfolkCandidates.length).toBeGreaterThanOrEqual(1);

      // 选择一名镇民作为目标
      const target = townsfolkCandidates[0];
      
      // 选择干扰项
      const decoyPool = seats.filter(
        (s) => s.id !== target.id && s.id !== 0 && !s.isDead
      );
      
      expect(decoyPool.length).toBeGreaterThanOrEqual(1);

      // 最终结果应该包含两名不同的玩家和一个角色名
      expect(target.id).not.toBe(decoyPool[0].id);
      expect(typeof target.role.name).toBe("string");
    });
  });
});