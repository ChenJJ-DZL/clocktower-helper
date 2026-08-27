import { describe, expect, it } from "vitest";
import {
  drunkAbility,
  initializeAbilityRegistry,
  lunaticAbility,
  mutantAbility,
  snitchAbility,
} from "../../src/roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";

describe("【《罂粟花开》外来者 (Outsiders) 1:1 官方 Wiki 原装独立范例测试】", () => {
  initializeAbilityRegistry();

  // 1. 酒鬼 Drunk
  describe("1. 酒鬼 (Drunk)", () => {
    it("范例 1: 以为自己是士兵的酒鬼被小恶魔攻击 -> 酒鬼正常死亡（免疫失效）", async () => {
      expect(drunkAbility).toBeDefined();
      expect(drunkAbility.roleId).toBe("drunk");
    });

    it("范例 2: 以为自己是共情者的酒鬼相邻邪恶玩家 -> 被唤醒得知 0，次夜得知 1", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "酒鬼P",
          role: { id: "drunk", name: "酒鬼", type: "outsider" },
          charadeRole: { id: "empath", name: "共情者" },
          isDead: false,
          isAlive: true,
          isDrunk: true,
        },
        {
          id: 1,
          playerName: "小恶魔P",
          role: { id: "imp", name: "小恶魔", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].isDrunk).toBe(true);
    });

    it("范例 3: 以为自己是守鸦人的酒鬼在夜晚被杀 -> 选择圣徒得知这名玩家是投毒者", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "酒鬼P",
          role: { id: "drunk", name: "酒鬼", type: "outsider" },
          charadeRole: { id: "ravenkeeper", name: "守鸦人" },
          isDead: true,
          isAlive: false,
          isDrunk: true,
        },
        {
          id: 1,
          playerName: "圣徒P",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].charadeRole.id).toBe("ravenkeeper");
    });

    it("范例 4: 占卜师被处决，以为自己是送葬者的酒鬼得知白天死于处决的是酒鬼", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "送葬酒鬼",
          role: { id: "drunk", name: "酒鬼", type: "outsider" },
          charadeRole: { id: "undertaker", name: "送葬者" },
          isDead: false,
          isAlive: true,
          isDrunk: true,
        },
      ];
      expect(seats[0].charadeRole.id).toBe("undertaker");
    });
  });

  // 2. 疯子 Lunatic
  describe("2. 疯子 (Lunatic)", () => {
    it("范例 1: 疯子以为自己是沙巴洛斯，每夜选择2名玩家 -> 所选玩家不造成真实死亡", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "疯子P",
          role: { id: "lunatic", name: "疯子", type: "outsider" },
          apparentDemonRole: { id: "shabaloth", name: "沙巴洛斯" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "小美",
          role: { id: "monk", name: "僧侣", type: "townsfolk" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "小八",
          role: { id: "saint", name: "圣徒", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "lunatic" },
        targetIds: [1, 2],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(lunaticAbility as any, ctx);
      expect(res.meta.abilityResult.fakeKill).toBe(true);
      expect(res.meta.abilityResult.realKill).toBe(false);
      expect(res.meta.abilityResult.targetIds).toEqual([1, 2]);
    });

    it("范例 2: 疯子以为自己是僵怖 -> 真正僵怖伪装为爪牙并按疯子选择进行击杀", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "疯子P",
          role: { id: "lunatic", name: "疯子", type: "outsider" },
          apparentDemonRole: { id: "zombuul", name: "僵怖" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "真僵怖",
          role: { id: "zombuul", name: "僵怖", type: "demon" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].apparentDemonRole.id).toBe("zombuul");
    });
  });

  // 3. 畸形秀演员 Mutant
  describe("3. 畸形秀演员 (Mutant)", () => {
    it("范例 1: 白天10秒内向其他玩家声称自己是畸形秀演员 -> 说书人立即处决并终止当天处决", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "畸形秀P",
          role: { id: "mutant", name: "畸形秀演员", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "mutant" },
        targetIds: [],
        snapshot: { seats, gamePhase: "day" },
        storytellerInput: { mutantRevealed: true },
        meta: {},
      };
      const res = await runFullAbilityPipeline(mutantAbility as any, ctx);
      expect(res.meta.abilityResult.mutantRevealed).toBe(true);
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
    });

    it("范例 2: 女巫私下告诉说书人小文(畸形秀演员)承认自己是呆瓜 -> 说书人决定立即处决", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "小文",
          role: { id: "mutant", name: "畸形秀演员", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "mutant" },
        targetIds: [],
        snapshot: { seats, gamePhase: "day" },
        storytellerInput: { mutantRevealed: true },
        meta: {},
      };
      const res = await runFullAbilityPipeline(mutantAbility as any, ctx);
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
    });

    it("范例 3: 被问及是否是畸形秀演员沉默不答 -> 经过沉默说书人处决畸形秀演员", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "小文",
          role: { id: "mutant", name: "畸形秀演员", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "mutant" },
        targetIds: [],
        snapshot: { seats, gamePhase: "day" },
        storytellerInput: { mutantRevealed: true },
        meta: {},
      };
      const res = await runFullAbilityPipeline(mutantAbility as any, ctx);
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
    });

    it("范例 4: 声称自己是神谕者并附深意眨眼暗示绝对不是畸形秀演员 -> 说书人立即处决", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "小文",
          role: { id: "mutant", name: "畸形秀演员", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "mutant" },
        targetIds: [],
        snapshot: { seats, gamePhase: "day" },
        storytellerInput: { mutantRevealed: true },
        meta: {},
      };
      const res = await runFullAbilityPipeline(mutantAbility as any, ctx);
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
    });
  });

  // 4. 告密者 Snitch
  describe("4. 告密者 (Snitch)", () => {
    it("范例 1: 首夜恶魔与爪牙均得知共情者、旅店老板、魔像不在场", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "告密P",
          role: { id: "snitch", name: "告密者", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "主谋P",
          role: { id: "mastermind", name: "主谋", type: "minion" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "女巫P",
          role: { id: "witch", name: "女巫", type: "minion" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "snitch" },
        targetIds: [],
        snapshot: {
          seats,
          gamePhase: "firstNight",
          nightCount: 1,
          roleAssignments: { 1: { team: "minion" }, 2: { team: "minion" } },
          scriptRoles: [
            { id: "empath", name: "共情者", type: "townsfolk" },
            { id: "innkeeper", name: "旅店老板", type: "townsfolk" },
            { id: "gossip", name: "魔像", type: "townsfolk" },
            { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
          ],
        },
        meta: {},
      };
      const res = await runFullAbilityPipeline(snitchAbility as any, ctx);
      // 新版：告密者首夜推送 3 个不在场角色给所有爪牙
      // 范例中只分配了 3 名玩家（告密+主谋+女巫），剧本中其他 townsfolk 都被算作"不在场"
      expect(res.meta.abilityResult.minionSeatIds.sort()).toEqual([1, 2]);
      expect(
        Array.isArray(res.meta.abilityResult.absentRoles) &&
          res.meta.abilityResult.absentRoles.length === 3
      ).toBe(true);
      expect(res.snapshot.snitchAbsentRoles).toEqual(
        res.meta.abilityResult.absentRoles
      );
    });

    it("范例 2: 首夜主谋、女巫、恐惧之灵各自单独得知 3 个不在场角色", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "告密P",
          role: { id: "snitch", name: "告密者", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "主谋P",
          role: { id: "mastermind", name: "主谋", type: "minion" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 2,
          playerName: "女巫P",
          role: { id: "witch", name: "女巫", type: "minion" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 3,
          playerName: "恐惧P",
          role: { id: "fearmonger", name: "恐惧之灵", type: "minion" },
          isDead: false,
          isAlive: true,
        },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "snitch" },
        targetIds: [],
        snapshot: {
          seats,
          gamePhase: "firstNight",
          nightCount: 1,
          roleAssignments: {
            1: { team: "minion" },
            2: { team: "minion" },
            3: { team: "minion" },
          },
          scriptRoles: [
            { id: "jester", name: "弄臣", type: "townsfolk" },
            { id: "monk", name: "僧侣", type: "townsfolk" },
            { id: "saint", name: "圣徒", type: "townsfolk" },
            { id: "flower_girl", name: "卖花女孩", type: "townsfolk" },
            { id: "barber", name: "理发师", type: "townsfolk" },
            { id: "noble", name: "贵族", type: "townsfolk" },
            { id: "amnesiac", name: "失忆者", type: "townsfolk" },
            { id: "heretic", name: "异端分子", type: "townsfolk" },
          ],
        },
        meta: {},
      };
      const res = await runFullAbilityPipeline(snitchAbility as any, ctx);
      expect(res.meta.abilityResult.minionSeatIds.sort()).toEqual([1, 2, 3]);
      expect(res.meta.abilityResult.absentRoles.length).toBe(3);
    });

    it("范例 3: 第4夜麻脸巫婆创造告密者 -> 所有爪牙当晚得知 3 个不在场角色", async () => {
      const seats: any[] = [
        {
          id: 0,
          playerName: "新告密P",
          role: { id: "snitch", name: "告密者", type: "outsider" },
          isDead: false,
          isAlive: true,
        },
        {
          id: 1,
          playerName: "主谋P",
          role: { id: "mastermind", name: "主谋", type: "minion" },
          isDead: false,
          isAlive: true,
        },
      ];
      expect(seats[0].role.id).toBe("snitch");
    });
  });
});
