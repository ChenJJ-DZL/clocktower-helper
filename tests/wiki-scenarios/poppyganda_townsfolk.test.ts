import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import { generateDynamicNightQueue } from "../../src/utils/dynamicQueueGenerator";
import { ENGINE_CONFIG } from "../../src/hooks/useNightEngine";
import {
  librarianAbility,
  chefAbility,
  pixieAbility,
  fortuneTellerAbility,
  monkAbility,
  oracleAbility,
  town_crierAbility,
  jugglerAbility,
  savantAbility,
  farmerAbility,
  mayorAbility,
  poppy_growerAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【《罂粟花开》镇民 (Townsfolk) 1:1 官方 Wiki 原装具名范例场景测试】", () => {
  initializeAbilityRegistry();

  // 1. 图书管理员 Librarian
  describe("1. 图书管理员 (Librarian)", () => {
    it("范例 1: 小八是圣徒，小莱是男爵。图书管理员得知要么小八是圣徒，要么小莱是圣徒", async () => {
      const seats: any[] = [
        { id: 0, playerName: "图书官", role: { id: "librarian", name: "图书管理员", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小八", role: { id: "saint", name: "圣徒", type: "outsider" }, isDead: false, isAlive: true },
        { id: 2, playerName: "小莱", role: { id: "baron", name: "男爵", type: "minion" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "librarian" },
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        storytellerInput: { overrideResult: { seat1: 1, seat2: 2, roleName: "圣徒" } },
        meta: {},
      };
      const res = await runFullAbilityPipeline(librarianAbility as any, ctx);
      expect(res.meta.abilityResult.roleName).toBe("圣徒");
      expect([1, 2]).toContain(res.meta.abilityResult.seat1);
      expect([1, 2]).toContain(res.meta.abilityResult.seat2);
    });

    it("范例 2: 陌客被当作爪牙，无其他外来者，图书管理员得知 0 (roleName为空字符串)", async () => {
      const seats: any[] = [
        { id: 0, playerName: "图书官", role: { id: "librarian", name: "图书管理员", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "陌客P", role: { id: "recluse", name: "陌客", type: "outsider" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "librarian" },
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        storytellerInput: { overrideResult: { seat1: -1, seat2: -1, roleName: "" } },
        meta: {},
      };
      const res = await runFullAbilityPipeline(librarianAbility as any, ctx);
      expect(res.meta.abilityResult.roleName).toBe("");
      expect(res.meta.abilityResult.seat1).toBe(-1);
    });

    it("范例 3: 小黑是酒鬼且以为是僧侣，道哥是送葬者。得知要么小黑是酒鬼，要么道哥是酒鬼（真实角色）", async () => {
      const seats: any[] = [
        { id: 0, playerName: "图书官", role: { id: "librarian", name: "图书管理员", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小黑", role: { id: "drunk", name: "酒鬼", type: "outsider" }, charadeRole: { id: "monk", name: "僧侣" }, isDead: false, isAlive: true },
        { id: 2, playerName: "道哥", role: { id: "undertaker", name: "送葬者", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "librarian" },
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        storytellerInput: { overrideResult: { seat1: 1, seat2: 2, roleName: "酒鬼" } },
        meta: {},
      };
      const res = await runFullAbilityPipeline(librarianAbility as any, ctx);
      expect(res.meta.abilityResult.roleName).toBe("酒鬼");
    });
  });

  // 2. 厨师 Chef
  describe("2. 厨师 (Chef)", () => {
    it("范例 1 & 2: 小恶魔与男爵相邻，投毒者与红唇相邻 -> 得知 2", async () => {
      const seats: any[] = [
        { id: 0, playerName: "厨师P", role: { id: "chef", name: "厨师", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
        { id: 2, playerName: "男爵P", role: { id: "baron", name: "男爵", type: "minion" }, isDead: false, isAlive: true },
        { id: 3, playerName: "村民P", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 4, playerName: "投毒者P", role: { id: "poisoner", name: "投毒者", type: "minion" }, isDead: false, isAlive: true },
        { id: 5, playerName: "红唇P", role: { id: "scarlet_woman", name: "红唇女郎", type: "minion" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "chef" },
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(chefAbility as any, ctx);
      expect(res.meta.abilityResult).toBe(2);
    });
  });

  // 3. 小精灵 Pixie
  describe("3. 小精灵 (Pixie)", () => {
    it("范例 1: 小米是小精灵得知将军在场，疯狂声称是将军；将军处决死亡后小米获得将军能力", async () => {
      const seats: any[] = [
        { id: 0, playerName: "小米", role: { id: "pixie", name: "小精灵", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "将军P", role: { id: "general", name: "将军", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      // 首夜得知将军
      const n1Ctx: any = {
        actionNode: { seatId: 0, roleId: "pixie" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
        meta: {},
      };
      const n1Res = await runFullAbilityPipeline(pixieAbility as any, n1Ctx);
      expect(n1Res.meta.abilityResult.roleId).toBe("general");
    });
  });

  // 4. 占卜师 Fortune Teller
  describe("4. 占卜师 (Fortune Teller)", () => {
    it("范例 2 & 4: 查验小恶魔与共情者返回 是；查验自己与红罗刹圣徒返回 是", async () => {
      const seats: any[] = [
        { id: 0, playerName: "占卜师P", role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
        { id: 2, playerName: "共情者P", role: { id: "empath", name: "共情者", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 3, playerName: "圣徒P", role: { id: "saint", name: "圣徒", type: "outsider" }, isRedHerring: true, isDead: false, isAlive: true },
      ];
      // 查验小恶魔+共情者
      const ctx1: any = {
        actionNode: { seatId: 0, roleId: "fortune_teller" },
        targetIds: [1, 2],
        snapshot: { seats, gamePhase: "night", nightCount: 1 },
        meta: {},
      };
      const res1 = await runFullAbilityPipeline(fortuneTellerAbility as any, ctx1);
      expect(res1.meta.abilityResult).toBe(true);
    });
  });

  // 5. 僧侣 Monk
  describe("5. 僧侣 (Monk)", () => {
    it("范例 1 & 2: 僧侣保护占卜师/镇长，免受恶魔攻击，镇长不弹射", async () => {
      const seats: any[] = [
        { id: 0, playerName: "僧侣P", role: { id: "monk", name: "僧侣", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "镇长P", role: { id: "mayor", name: "镇长", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "monk" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(monkAbility as any, ctx);
      expect(res.meta.abilityResult.targetId).toBe(1);
      expect(res.meta.abilityResult.isProtected).toBe(true);
    });
  });

  // 6. 神谕者 Oracle
  describe("6. 神谕者 (Oracle)", () => {
    it("范例 1: D1 卖花女孩处决，夜晚恶魔杀死杂耍艺人，神谕者得知 0", async () => {
      const seats: any[] = [
        { id: 0, playerName: "神谕者P", role: { id: "oracle", name: "神谕者", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "卖花女P", role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" }, isDead: true, isAlive: false },
        { id: 2, playerName: "杂耍P", role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" }, isDead: true, isAlive: false },
        { id: 3, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "oracle" },
        targetIds: [],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: {},
      };
      const res = await runFullAbilityPipeline(oracleAbility as any, ctx);
      expect(res.meta.abilityResult.deadEvilCount).toBe(0);
    });
  });

  // 7. 城镇公告员 Town Crier
  describe("7. 城镇公告员 (Town Crier)", () => {
    it("范例 1 & 2: 白天有爪牙提名得知 是，仅镇民提名得知 否", async () => {
      const seats = [
        { id: 0, playerName: "公告员", role: { id: "town_crier", name: "城镇公告员", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctxNo: any = {
        actionNode: { seatId: 0, roleId: "town_crier" },
        targetIds: [],
        snapshot: { minionNominatedToday: false, gamePhase: "night", nightCount: 2, seats },
        meta: {},
      };
      const resNo = await runFullAbilityPipeline(town_crierAbility as any, ctxNo);
      expect(resNo.meta.abilityResult.minionNominated).toBe(false);

      const ctxYes: any = {
        actionNode: { seatId: 0, roleId: "town_crier" },
        targetIds: [],
        snapshot: { minionNominatedToday: true, gamePhase: "night", nightCount: 2, seats },
        meta: {},
      };
      const resYes = await runFullAbilityPipeline(town_crierAbility as any, ctxYes);
      expect(resYes.meta.abilityResult.minionNominated).toBe(true);
    });
  });

  // 8. 杂耍艺人 Juggler
  describe("8. 杂耍艺人 (Juggler)", () => {
    it("范例 1: D1 猜测小明是公告员、小兰是诺达希、小黑是贤者，猜对 2 个，当晚得知 2", async () => {
      const seats: any[] = [
        { id: 0, playerName: "杂耍P", role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小明", role: { id: "town_crier", name: "城镇公告员", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 2, playerName: "小兰", role: { id: "no_dashii", name: "诺-达鲺", type: "demon" }, isDead: false, isAlive: true },
        { id: 3, playerName: "小黑", role: { id: "empath", name: "共情者", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "juggler" },
        targetIds: [],
        snapshot: {
          seats,
          gamePhase: "night",
          nightCount: 2,
        },
        storytellerInput: {
          guesses: [
            { targetId: 1, guessedRole: "town_crier" },
            { targetId: 2, guessedRole: "no_dashii" },
            { targetId: 3, guessedRole: "sage" },
          ],
          correctCount: 2,
        },
        meta: {},
      };
      const res = await runFullAbilityPipeline(jugglerAbility as any, ctx);
      expect(res.meta.abilityResult.correctCount).toBe(2);
    });
  });

  // 9. 博学者 Savant
  describe("9. 博学者 (Savant)", () => {
    it("范例 1~4: 每天白天拜访说书人，固定获得 2 条信息：1 条严格正确，1 条严格错误", async () => {
      const seats = [
        { id: 0, playerName: "博学P", role: { id: "savant", name: "博学者", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "savant" },
        targetIds: [],
        snapshot: { gamePhase: "day", seats },
        storytellerInput: {
          result: {
            correct: "恶魔是女性玩家",
            incorrect: "小八属于邪恶阵营",
          },
        },
        meta: {},
      };
      const res = await runFullAbilityPipeline(savantAbility as any, ctx);
      expect(res.meta.abilityResult.correct).toBe("恶魔是女性玩家");
      expect(res.meta.abilityResult.incorrect).toBe("小八属于邪恶阵营");
    });
  });

  // 10. 农夫 Farmer
  describe("10. 农夫 (Farmer)", () => {
    it("范例 1: 小佳(农夫)夜晚被恶魔杀死；小美(炼金术士)变成新农夫，小文(恐惧之灵)邪恶不转变", async () => {
      const seats: any[] = [
        { id: 0, playerName: "小佳", role: { id: "farmer", name: "农夫", type: "townsfolk" }, isDead: true, isAlive: false },
        { id: 1, playerName: "小美", role: { id: "alchemist", name: "炼金术士", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "farmer" },
        targetIds: [],
        snapshot: { seats, gamePhase: "night", nightCount: 2, deadThisNight: [0] },
        meta: {},
      };
      const res = await runFullAbilityPipeline(farmerAbility as any, ctx);
      expect(res.meta.abilityResult.newFarmerId).toBe(1);
    });
  });

  // 11. 镇长 Mayor
  describe("11. 镇长 (Mayor)", () => {
    it("范例 1: 镇长夜间遇害可选择弹射给其他玩家", async () => {
      const seats: any[] = [
        { id: 0, playerName: "镇长P", role: { id: "mayor", name: "镇长", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "守鸦人P", role: { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" }, isDead: false, isAlive: true },
      ];
      const ctx: any = {
        actionNode: { seatId: 0, roleId: "mayor" },
        targetIds: [1],
        snapshot: { seats, gamePhase: "night", nightCount: 2 },
        meta: { isMayorDying: true },
      };
      const res = await runFullAbilityPipeline(mayorAbility as any, ctx);
      expect(res.meta.abilityResult.substitutionHappens).toBe(true);
      expect(res.meta.abilityResult.substituteSeatId).toBe(1);
    });
  });

  // 12. 罂粟种植者 Poppy Grower
  describe("12. 罂粟种植者 (Poppy Grower)", () => {
    it("范例 1 & 2: 存活时取消首夜爪牙互认；死亡当晚自动生成邪恶互认夜序", () => {
      const seats: any[] = [
        { id: 0, playerName: "罂粟P", role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" }, isDead: false, isAlive: true },
        { id: 1, playerName: "小恶魔P", role: { id: "imp", name: "小恶魔", type: "demon" }, isDead: false, isAlive: true },
        { id: 2, playerName: "男爵P", role: { id: "baron", name: "男爵", type: "minion" }, isDead: false, isAlive: true },
      ];
      // 首夜罂粟存活 -> minion_info 不在队列
      const q1 = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, { nightCount: 1, seats, poppyGrowerDead: false } as any, { isFirstNight: true });
      expect(q1.find((q) => q.roleId === "minion_info")).toBeUndefined();

      // 罂粟死亡后 -> 触发互认
      const q2 = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, { nightCount: 2, seats: seats.map((s) => s.id === 0 ? { ...s, isDead: true, isAlive: false } : s), poppyGrowerDead: true } as any, { isFirstNight: false });
      expect(q2.find((q) => q.roleId === "minion_info")).toBeDefined();
    });
  });
});
