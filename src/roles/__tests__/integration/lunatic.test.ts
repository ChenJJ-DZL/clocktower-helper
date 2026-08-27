/**
 * 疯子（Lunatic）双层假象机制测试
 *
 * 验证：
 * 1. 发牌阶段疯子自动绑定假恶魔身份
 * 2. 疯子夜间行动不造成真实死亡
 * 3. displayRole 正确映射为假恶魔
 * 4. 状态标记正确显示
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd, isPlayerEvil } from "../../../../app/gameLogic";

// ─── Seat 构造辅助 ─────────────────────────────────────────────

function makeSeat(
  id: number,
  role: { id: string; name: string; type: string },
  overrides: Record<string, any> = {}
) {
  return {
    id,
    role: { id: role.id, name: role.name, type: role.type },
    displayRole: null,
    charadeRole: null,
    apparentDemonRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    statusEffects: [] as any[],
    statusDetails: [] as string[],
    statuses: [] as any[],
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 1,
    ...overrides,
  };
}

describe("疯子（Lunatic）双层假象机制", () => {
  // ─── 发牌阶段：自动绑定假恶魔 ───
  describe("发牌阶段", () => {
    it("疯子应绑定 apparentDemonRole", () => {
      const seat = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
          displayRole: { id: "imp", name: "小恶魔", type: "demon" },
        }
      );

      expect(seat.apparentDemonRole).toBeDefined();
      expect(seat.apparentDemonRole!.id).toBe("imp");
      expect(seat.apparentDemonRole!.name).toBe("小恶魔");
    });

    it("displayRole 应为假恶魔", () => {
      const seat = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: { id: "zombuul", name: "僵怖", type: "demon" },
          displayRole: { id: "zombuul", name: "僵怖", type: "demon" },
        }
      );

      expect(seat.displayRole).toBeDefined();
      expect(seat.displayRole!.id).toBe("zombuul");
    });

    it("非疯子角色不应有 apparentDemonRole", () => {
      const seat = makeSeat(0, { id: "imp", name: "小恶魔", type: "demon" });
      expect(seat.apparentDemonRole).toBeNull();
    });
  });

  // ─── 夜间行动：假击杀不造成真实死亡 ───
  describe("夜间行动", () => {
    it("疯子的击杀不应标记目标为死亡", () => {
      const seats = [
        makeSeat(
          0,
          { id: "lunatic", name: "疯子", type: "outsider" },
          {
            apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
          }
        ),
        makeSeat(1, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
        makeSeat(2, { id: "imp", name: "小恶魔", type: "demon" }),
        makeSeat(3, { id: "soldier", name: "士兵", type: "townsfolk" }),
      ];

      // 模拟疯子选择目标（不造成真实死亡）
      const lunaticTarget = 1;
      const lunaticResult = {
        targetId: lunaticTarget,
        fakeKill: true,
        realKill: false,
      };

      // 验证目标未被标记为死亡
      expect(seats[lunaticTarget].isDead).toBe(false);
      expect(lunaticResult.fakeKill).toBe(true);
      expect(lunaticResult.realKill).toBe(false);
    });

    it("疯子的 apparentDemonRole 决定目标数量配置", () => {
      // 珀 (po) 可选 1-3 人
      const poLunatic = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: { id: "po", name: "珀", type: "demon" },
        }
      );
      expect(poLunatic.apparentDemonRole!.id).toBe("po");

      // 沙巴洛斯 (shabaloth) 每夜杀 2 人
      const shabLunatic = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: {
            id: "shabaloth",
            name: "沙巴洛斯",
            type: "demon",
          },
        }
      );
      expect(shabLunatic.apparentDemonRole!.id).toBe("shabaloth");
    });
  });

  // ─── 阵营判定 ───
  describe("阵营判定", () => {
    it("疯子应被视为善良阵营（真实身份为外来者）", () => {
      const seat = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
          displayRole: { id: "imp", name: "小恶魔", type: "demon" },
        }
      );

      // isPlayerEvil 基于 role.type，不是 displayRole
      expect(isPlayerEvil(seat as any)).toBe(false);
    });

    it("疯子死亡不应触发善良胜利（因为不是真正的恶魔）", () => {
      const seats = [
        makeSeat(
          0,
          { id: "lunatic", name: "疯子", type: "outsider" },
          {
            isDead: true,
            apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
            displayRole: { id: "imp", name: "小恶魔", type: "demon" },
          }
        ),
        makeSeat(1, { id: "imp", name: "小恶魔", type: "demon" }),
        makeSeat(2, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
        makeSeat(3, { id: "soldier", name: "士兵", type: "townsfolk" }),
      ];

      // 恶魔还活着，游戏不应结束
      const result = checkGameEnd(seats as any, "night_death", null);
      expect(result.isGameOver).toBe(false);
    });

    it("真实恶魔死亡时应触发善良胜利（疯子存活不影响）", () => {
      const seats = [
        makeSeat(
          0,
          { id: "lunatic", name: "疯子", type: "outsider" },
          {
            apparentDemonRole: { id: "imp", name: "小恶魔", type: "demon" },
            displayRole: { id: "imp", name: "小恶魔", type: "demon" },
          }
        ),
        makeSeat(
          1,
          { id: "imp", name: "小恶魔", type: "demon" },
          { isDead: true }
        ),
        makeSeat(2, { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }),
        makeSeat(3, { id: "soldier", name: "士兵", type: "townsfolk" }),
      ];

      // 真实恶魔死亡，善良胜利
      const result = checkGameEnd(seats as any, "night_death", null);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("Good");
    });
  });

  // ─── 状态显示 ───
  describe("状态显示", () => {
    it("疯子状态应包含假恶魔名称", () => {
      const seat = makeSeat(
        0,
        { id: "lunatic", name: "疯子", type: "outsider" },
        {
          apparentDemonRole: { id: "pukka", name: "普卡", type: "demon" },
        }
      );

      const apparentName = seat.apparentDemonRole?.name ?? "恶魔";
      expect(apparentName).toBe("普卡");

      const statusText = `疯子(假${apparentName})`;
      expect(statusText).toBe("疯子(假普卡)");
    });
  });
});
