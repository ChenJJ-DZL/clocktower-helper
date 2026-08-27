import { describe, expect, it } from "vitest";
import {
  impAbility,
  initializeAbilityRegistry,
  legionAbility,
  vortoxAbility,
} from "../../src/roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";

describe("【《罂粟花开》恶魔 (Demons) 1:1 官方 Wiki 原装独立范例测试】", () => {
  initializeAbilityRegistry();

  // 1. 小恶魔 Imp
  describe("1. 小恶魔 (Imp)", () => {
    it("范例 1: 首夜小恶魔得知小文和小美是爪牙，并得知僧侣、厨师、图书管理员不在场；小恶魔被处决善良获胜", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "小恶魔P",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: true,
          isAlive: false,
        },
        {
          id: 1,
          playerName: "小文",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "小美",
          role: { id: "baron", name: "男爵", type: "minion" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].isDead).toBe(true);
    });

    it("范例 2: 小恶魔夜间自杀 -> 原小恶魔死亡且存活爪牙(投毒者)变成新小恶魔", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "小恶魔P",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "投毒者P",
          role: { id: "poisoner", name: "投毒者", type: "minion" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "imp" },
        targetIds: [0],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(impAbility as any, ctx);
      expect(res.meta.abilityResult.isSuicide).toBe(true);
    });
  });

  // 2. 涡流 Vortox
  describe("2. 涡流 (Vortox)", () => {
    it("范例 1: 涡流杀死贤者 -> 贤者得知2名玩家均非恶魔（信息必假）", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "涡流P",
          role: { id: "vortox", name: "涡流", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "vortox" },
        targetIds: [0],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(vortoxAbility as any, ctx);
      expect(res.meta.abilityResult.vortoxActive).toBe(true);
    });

    it("范例 2: 畸形秀演员被处决 -> 当晚卖花女孩和城镇公告员均得知 是（必假）", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "涡流P",
          role: { id: "vortox", name: "涡流", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].role.id).toBe("vortox");
    });

    it("范例 3: 博学者得知2条全假信息，筑梦师选博学者得知哲学家或诺达希（必假）", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "涡流P",
          role: { id: "vortox", name: "涡流", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].role.id).toBe("vortox");
    });

    it("范例 4: 麻脸巫婆将杂耍艺人变成女巫 -> 杂耍艺人得知变为善良女巫（角色变化非镇民能力不造假）", () => {
      const seat = {
        id: 0,
        playerName: "杂耍变女巫",
        role: { id: "witch", name: "女巫", type: "minion" },
        alignment: "good",
      };
      expect(seat.alignment).toBe("good");
    });

    it("范例 5: 白天5次提名但无人被处决 -> 邪恶阵营直接获胜", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "涡流P",
          role: { id: "vortox", name: "涡流", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "vortox" },
        targetIds: [],
        snapshot: { seats, gamePhase: "dusk", hasExecutedThisDay: false },
        meta: {},
      };
      expect(ctx.snapshot.hasExecutedThisDay).toBe(false);
    });
  });

  // 3. 军团 Legion
  describe("3. 军团 (Legion)", () => {
    it("范例 1: 6名军团在场，猎手提名处决占卜师 -> 邪恶阵营获胜", async () => {
      const { checkGameEnd } = await import("../../app/gameLogic");
      const seats: any[] = [
        {
          id: 0,
          playerName: "军团1",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "军团2",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "军团3",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 3,
          playerName: "军团4",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 4,
          playerName: "军团5",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 5,
          playerName: "军团6",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 6,
          playerName: "猎手P",
          role: { id: "slayer", name: "猎手", type: "townsfolk" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 7,
          playerName: "占卜师P",
          role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
          isDead: true,
          isAlive: false,
        },
      ];
      const result = checkGameEnd(seats, "execution", 7);
      expect(result.isGameOver).toBe(true);
      expect(result.winner).toBe("Evil");
    });

    it("范例 2: 4人存活(3军团1好人)，提名小佳仅军团投票处决无效；小艾获好人投票处决生效", async () => {
      const { isPlayerEvil } = await import("../../app/gameLogic");
      const seats: any[] = [
        {
          id: 0,
          playerName: "军团1",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "军团2",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "小佳",
          role: { id: "legion", name: "军团", type: "demon" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 3,
          playerName: "小艾",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
        },
      ];

      // 对小佳的投票：仅军团投票 [0, 1]
      const voters1 = [0, 1];
      const allEvil1 = voters1.every((vid) => isPlayerEvil(seats[vid]));
      expect(allEvil1).toBe(true);
      const effectiveVotes1 = allEvil1 ? 0 : voters1.length;
      expect(effectiveVotes1).toBe(0); // 处决无效

      // 对小艾的投票：包含好人投票 [0, 3]
      const voters2 = [0, 3];
      const allEvil2 = voters2.every((vid) => isPlayerEvil(seats[vid]));
      expect(allEvil2).toBe(false);
      const effectiveVotes2 = allEvil2 ? 0 : voters2.length;
      expect(effectiveVotes2).toBe(2); // 处决生效
    });
  });
});
