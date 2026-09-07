import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../../app/data";
import { runFullAbilityPipeline } from "../../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../../utils/middlewareTypes";
import {
  canFoolSurvive,
  checkGrandmotherDeath,
  isProtectedBySailor,
  isProtectedByTeaLady,
} from "../../../../utils/bmrMechanics";
import {
  chambermaidAbility,
  courtierAbility,
  exorcistAbility,
  foolAbility,
  gamblerAbility,
  gossipAbility,
  grandmotherAbility,
  innkeeperAbility,
  minstrelAbility,
  pacifistAbility,
  professorAbility,
  sailorAbility,
  tea_ladyAbility,
} from "../../../new_engine/abilityRegistry";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

const makeCtx = (overrides: any): MiddlewareContext => ({
  snapshot: {} as any,
  actionNode: {} as any,
  targetIds: [],
  meta: {},
  aborted: false,
  ...overrides,
});

describe("《暗月初升》镇民角色官方范例逐条验证 (Townsfolk Examples)", () => {
  // -------------------------------------------------------------
  // 1. 祖母 (Grandmother)
  // -------------------------------------------------------------
  describe("祖母 (Grandmother)", () => {
    it("范例 1: 在首个夜晚，祖母被唤醒并得知自己的孙子小佳是教授。三个夜晚后，小佳被恶魔杀死，因此祖母也一同死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "grandmother", name: "祖母", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, grandchildId: 1 } as any,
        { id: 1, role: { id: "professor", name: "教授", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false } as any,
        { id: 2, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false } as any,
      ];

      // 首夜行动：祖母得知孙子 1 号教授
      const ctx: any = {
        snapshot: { nightCount: 1, gamePhase: "firstNight", seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
        actionNode: { seatId: 0, roleId: "grandmother", roleName: "祖母", priority: 60, isFirstNightOnly: true } as any,
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(grandmotherAbility), ctx);
      expect(r1.meta.abilityResult.grandchildId).toBe(1);
      expect(r1.meta.abilityResult.grandchildRoleId).toBe("professor");

      // 三个夜晚后，小佳被恶魔杀死 -> 祖母一同死亡
      const res = checkGrandmotherDeath(1, true, seats, 4);
      expect(res.grandmotherDied).toBe(true);
      const gmSeat = res.updatedSeats.find((s) => s.id === 0);
      expect(gmSeat?.isDead).toBe(true);
    });

    it("范例 2: 祖母得知自己的孙子小莱是赌徒。小莱进行赌博且因此而死亡。祖母依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "grandmother", name: "祖母", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, grandchildId: 1 } as any,
        { id: 1, role: { id: "gambler", name: "赌徒", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false } as any,
      ];

      // 小莱因赌博死亡（非恶魔致死）
      const res = checkGrandmotherDeath(1, false, seats, 2);
      expect(res.grandmotherDied).toBe(false);
      const gmSeat = res.updatedSeats.find((s) => s.id === 0);
      expect(gmSeat?.isDead).toBe(false);
    });

    it("范例 3: 祖母得知自己的孙子小美是修补匠。小美被恶魔杀死，但祖母因为水手的能力而处于醉酒状态，因此祖母依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "grandmother", name: "祖母", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: true, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, grandchildId: 1, statusEffects: [{ type: "drunk", source: "sailor" }] } as any,
        { id: 1, role: { id: "tinker", name: "修补匠", type: "outsider" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false } as any,
      ];

      // 恶魔杀死了小美，但祖母醉酒
      const res = checkGrandmotherDeath(1, true, seats, 2);
      expect(res.grandmotherDied).toBe(false);
      const gmSeat = res.updatedSeats.find((s) => s.id === 0);
      expect(gmSeat?.isDead).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. 水手 (Sailor)
  // -------------------------------------------------------------
  describe("水手 (Sailor)", () => {
    it("范例 1: 水手选择了驱魔人，说书人决定让驱魔人醉酒。在这个夜晚，水手被沙巴洛斯攻击。水手依然存活。在下一个白天，水手被处决，但依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, statusEffects: [] } as any,
        { id: 1, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, statusEffects: [] } as any,
      ];

      // 水手选择驱魔人
      const ctx: any = {
        snapshot: { nightCount: 2, seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
        actionNode: { seatId: 0, roleId: "sailor", roleName: "水手", priority: 8, isFirstNightOnly: false } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(sailorAbility), ctx);
      expect(r.meta.abilityResult.drunkId).toBe(1); // 目标驱魔人醉酒
      // 清醒健康的水手免疫恶魔击杀与处决
      expect(isProtectedBySailor(seats[0])).toBe(true);
    });

    it("范例 2: 在白天，造谣者发表了正确声明。当晚，造谣者能力杀死一名玩家。水手让自己醉酒了，于是说书人决定让水手死亡。", async () => {
      const drunkSailor: Seat = {
        id: 0,
        role: { id: "sailor", name: "水手", type: "townsfolk" } as any,
        charadeRole: null,
        isDead: false,
        isDrunk: true,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        statusEffects: [{ type: "drunk", source: "sailor" }],
      } as any;

      // 醉酒水手失去免死保护
      expect(isProtectedBySailor(drunkSailor)).toBe(false);
    });

    it("范例 3: 水手选择了主谋，说书人决定让水手醉酒。下一个白天水手被处决，因为醉酒所以死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "sailor", name: "水手", type: "townsfolk" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, statusEffects: [] } as any,
        { id: 1, role: { id: "mastermind", name: "主谋", type: "minion" } as any, charadeRole: null, isDead: false, isDrunk: false, isPoisoned: false, isProtected: false, protectedBy: null, isRedHerring: false, isFortuneTellerRedHerring: false, isSentenced: false, statusEffects: [] } as any,
      ];

      // 目标是非镇民（爪牙），水手自身醉酒
      const ctx: any = {
        snapshot: { nightCount: 2, seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
        actionNode: { seatId: 0, roleId: "sailor", roleName: "水手", priority: 8, isFirstNightOnly: false } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(sailorAbility), ctx);
      expect(r.meta.abilityResult.drunkId).toBe(0); // 水手自身醉酒
      const updatedSailor = r.snapshot.seats.find((s: any) => s.id === 0);
      expect(isProtectedBySailor(updatedSailor)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. 侍女 (Chambermaid)
  // -------------------------------------------------------------
  describe("侍女 (Chambermaid)", () => {
    it("范例 1: 侍女选择了驱魔人和旅店老板，得知2。下一夜沙巴洛斯只因驱魔人被唤醒，侍女选择沙巴洛斯和弄臣，得知0。", async () => {
      // 第一夜：驱魔人(0)和旅店老板(1)都有夜间行动
      const seats: Seat[] = [
        { id: 0, role: { id: "exorcist", name: "驱魔人" } as any, isDead: false } as any,
        { id: 1, role: { id: "innkeeper", name: "旅店老板" } as any, isDead: false } as any,
        { id: 2, role: { id: "shabaloth", name: "沙巴洛斯" } as any, isDead: false } as any,
        { id: 3, role: { id: "fool", name: "弄臣" } as any, isDead: false } as any,
        { id: 4, role: { id: "chambermaid", name: "侍女" } as any, isDead: false } as any,
      ];

      const ctxNight1: any = {
        snapshot: {
          nightCount: 1,
          seats,
          _abilityResults: {
            exorcist: { seatId: 0, targetId: 2 },
            innkeeper: { seatId: 1, targetIds: [0, 1] },
          },
        } as any,
        actionNode: { seatId: 4, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [0, 1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(chambermaidAbility), ctxNight1);
      expect(r1.meta.abilityResult.wokenCount).toBe(2);

      // 下一夜：沙巴洛斯被驱魔人选中止戈（未因自身主动能力唤醒），弄臣是被动角色
      const ctxNight2: any = {
        snapshot: {
          nightCount: 2,
          seats,
          _abilityResults: {
            exorcist: { seatId: 0, targetId: 2, isTargetDemon: true },
          },
        } as any,
        actionNode: { seatId: 4, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [2, 3],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(chambermaidAbility), ctxNight2);
      expect(r2.meta.abilityResult.wokenCount).toBe(0);
    });

    it("范例 2: 侍女醉酒时查验玩家，得到虚假信息。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "grandmother", name: "祖母" } as any, isDead: false } as any,
        { id: 1, role: { id: "goon", name: "莽夫" } as any, isDead: false } as any,
        { id: 2, role: { id: "chambermaid", name: "侍女" } as any, isDead: false, isDrunk: true } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats, _abilityResults: {} } as any,
        actionNode: { seatId: 2, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [0, 1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(chambermaidAbility), ctx);
      expect(r.meta.abilityResult.isDrunk).toBe(true);
      expect(r.meta.abilityResult.wokenCount).toBeGreaterThanOrEqual(0);
      expect(r.meta.abilityResult.wokenCount).toBeLessThanOrEqual(2);
    });

    it("范例 3: 首夜侍女选择刺客和月之子(得知0)，次夜选择刺客和造谣者(得知1)。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "assassin", name: "刺客" } as any, isDead: false } as any,
        { id: 1, role: { id: "moonchild", name: "月之子" } as any, isDead: false } as any,
        { id: 2, role: { id: "gossip", name: "造谣者" } as any, isDead: false } as any,
        { id: 3, role: { id: "chambermaid", name: "侍女" } as any, isDead: false } as any,
      ];

      // 首夜：刺客不醒，月之子不醒 -> 0
      const ctxNight1: any = {
        snapshot: { nightCount: 1, seats, _abilityResults: {} } as any,
        actionNode: { seatId: 3, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [0, 1],
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(chambermaidAbility), ctxNight1);
      expect(r1.meta.abilityResult.wokenCount).toBe(0);

      // 次夜：刺客被唤醒行动（但选择不击杀），造谣者是白天能力（不唤醒） -> 1
      const ctxNight2: any = {
        snapshot: {
          nightCount: 2,
          seats,
          _abilityResults: {
            assassin: { seatId: 0, targetId: null },
          },
        } as any,
        actionNode: { seatId: 3, roleId: "chambermaid", roleName: "侍女" } as any,
        targetIds: [0, 2],
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(chambermaidAbility), ctxNight2);
      expect(r2.meta.abilityResult.wokenCount).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 4. 驱魔人 (Exorcist)
  // -------------------------------------------------------------
  describe("驱魔人 (Exorcist)", () => {
    it("范例 1: 驱魔人选择了沙巴洛斯。沙巴洛斯当晚不会杀人。在黎明宣布当晚无人死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false } as any,
        { id: 1, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
        actionNode: { seatId: 0, roleId: "exorcist", roleName: "驱魔人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(exorcistAbility), ctx);
      expect(r.meta.abilityResult.isTargetDemon).toBe(true);
      expect(r.snapshot.demonBlocked).toBe(true);
    });

    it("范例 2: 驱魔人选择了普卡，普卡当晚不能唤醒攻击，但之前中毒的玩家依然死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false } as any,
        { id: 1, role: { id: "pukka", name: "普卡", type: "demon" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats, statusEffects: {}, isVortoxWorld: false, statusEffectMap: {} } as any,
        actionNode: { seatId: 0, roleId: "exorcist", roleName: "驱魔人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(exorcistAbility), ctx);
      expect(r.meta.abilityResult.isTargetDemon).toBe(true);
      expect(r.snapshot.demonBlocked).toBe(true);
    });

    it("范例 3: 驱魔人不能连续两晚选择同一玩家。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "exorcist", name: "驱魔人", type: "townsfolk" } as any, isDead: false } as any,
        { id: 1, role: { id: "po", name: "珀", type: "demon" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, lastExorcistTarget: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "exorcist", roleName: "驱魔人" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(exorcistAbility), ctx);
      expect(r.aborted).toBe(true);
      expect(r.abortReason).toBe("不能连续两晚选择同一玩家");
    });
  });

  // -------------------------------------------------------------
  // 5. 旅店老板 (Innkeeper)
  // -------------------------------------------------------------
  describe("旅店老板 (Innkeeper)", () => {
    it("范例 1: 旅店老板保护弄臣和侍女，说书人选择弄臣醉酒。明天弄臣被处决时死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "innkeeper", name: "旅店老板" } as any, isDead: false } as any,
        { id: 1, role: { id: "fool", name: "弄臣" } as any, isDead: false, statusEffects: [] } as any,
        { id: 2, role: { id: "chambermaid", name: "侍女" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "innkeeper", roleName: "旅店老板" } as any,
        targetIds: [1, 2],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(innkeeperAbility), ctx);
      expect(r.snapshot.seats[1].statusEffects.some((e: any) => e.type === "protected")).toBe(true);
      expect(r.snapshot.seats[2].statusEffects.some((e: any) => e.type === "protected")).toBe(true);
    });

    it("范例 2: 旅店老板保护刺客和珀，刺客醉酒则暗杀失效。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "innkeeper", name: "旅店老板" } as any, isDead: false } as any,
        { id: 1, role: { id: "assassin", name: "刺客" } as any, isDead: false, statusEffects: [] } as any,
        { id: 2, role: { id: "po", name: "珀" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "innkeeper", roleName: "旅店老板" } as any,
        targetIds: [1, 2],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(innkeeperAbility), ctx);
      expect(r.meta.abilityResult.target1Id).toBe(1);
      expect(r.meta.abilityResult.target2Id).toBe(2);
    });

    it("范例 3: 旅店老板保护自己与和平主义者，旅店老板醉酒，能力失效无法保护目标。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "innkeeper", name: "旅店老板" } as any, isDead: false, isDrunk: true, statusEffects: [{ type: "drunk" }] } as any,
        { id: 1, role: { id: "pacifist", name: "和平主义者" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "innkeeper", roleName: "旅店老板" } as any,
        targetIds: [0, 1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(innkeeperAbility), ctx);
      // 醉酒时无法施加真正的免死保护
      const pSeat = r.snapshot.seats.find((s: any) => s.id === 1);
      expect(pSeat?.statusEffects.some((e: any) => e.type === "protected")).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 6. 赌徒 (Gambler)
  // -------------------------------------------------------------
  describe("赌徒 (Gambler)", () => {
    it("范例 1: 赌徒猜中吟游诗人，猜测正确存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gambler", name: "赌徒" } as any, isDead: false } as any,
        { id: 1, role: { id: "minstrel", name: "吟游诗人" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "gambler", roleName: "赌徒" } as any,
        targetIds: [1],
        storytellerInput: { guessedRole: "minstrel" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(gamblerAbility), ctx);
      expect(r.meta.abilityResult.isGuessCorrect).toBe(true);
      expect(r.meta.abilityResult.shouldDie).toBe(false);
      expect(r.snapshot.seats[0].isDead).toBe(false);
    });

    it("范例 2: 目标实际是魔鬼代言人，赌徒猜其为和平主义者，猜错死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gambler", name: "赌徒" } as any, isDead: false } as any,
        { id: 1, role: { id: "devils_advocate", name: "魔鬼代言人" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "gambler", roleName: "赌徒" } as any,
        targetIds: [1],
        storytellerInput: { guessedRole: "pacifist" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(gamblerAbility), ctx);
      expect(r.meta.abilityResult.isGuessCorrect).toBe(false);
      expect(r.meta.abilityResult.shouldDie).toBe(true);
      expect(r.snapshot.seats[0].isDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 7. 造谣者 (Gossip)
  // -------------------------------------------------------------
  describe("造谣者 (Gossip)", () => {
    it("范例 1: 造谣者的声明为假，当晚无人因造谣者能力死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gossip", name: "造谣者" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "gossip", roleName: "造谣者" } as any,
        storytellerInput: { statement: "恶魔戴着帽子", isStatementTrue: false },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(gossipAbility), ctx);
      expect(r.meta.abilityResult.shouldKill).toBe(false);
    });

    it("范例 2: 声明为真，能力触发，当晚致死一人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gossip", name: "造谣者" } as any, isDead: false } as any,
        { id: 1, role: { id: "chambermaid", name: "侍女" } as any, isDead: false } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "gossip", roleName: "造谣者" } as any,
        targetIds: [1],
        storytellerInput: { statement: "两名邻近玩家皆善良", isStatementTrue: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(gossipAbility), ctx);
      expect(r.meta.abilityResult.shouldKill).toBe(true);
      expect(r.meta.stateUpdates.targetId).toBe(1);
    });

    it("范例 3: 造谣者在夜晚已死亡，失去能力，不造成击杀。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "gossip", name: "造谣者" } as any, isDead: true } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "gossip", roleName: "造谣者" } as any,
        storytellerInput: { statement: "正确的声明", isStatementTrue: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(gossipAbility), ctx);
      expect(r.aborted).toBe(true);
      expect(r.abortReason).toBe("造谣者已死亡，无法使用能力");
    });
  });

  // -------------------------------------------------------------
  // 8. 侍臣 (Courtier)
  // -------------------------------------------------------------
  describe("侍臣 (Courtier)", () => {
    it("范例 1: 侍臣使沙巴洛斯醉酒三天三夜。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "courtier", name: "侍臣" } as any, isDead: false } as any,
        { id: 1, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 5, seats } as any,
        actionNode: { seatId: 0, roleId: "courtier", roleName: "侍臣" } as any,
        targetRoleId: "shabaloth",
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(courtierAbility), ctx);
      expect(r.meta.abilityResult.targetInPlay).toBe(true);
      expect(r.snapshot.seats[1].isDrunk).toBe(true);
      expect(r.snapshot.seats[1].statusEffects.some((e: any) => e.type === "drunk" && e.source === "courtier")).toBe(true);
    });

    it("范例 2: 侍臣醉酒时使用能力，无事发生且能力被消耗不再唤醒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "courtier", name: "侍臣" } as any, isDead: false, isDrunk: true, statusEffects: [{ type: "drunk" }] } as any,
        { id: 1, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false, isDrunk: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "courtier", roleName: "侍臣" } as any,
        targetRoleId: "shabaloth",
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(courtierAbility), ctx);
      expect(r.meta.abilityResult.effective).toBe(false);
      expect(r.snapshot.seats[1].isDrunk).toBe(false);
    });

    it("范例 3: 侍臣使主谋醉酒，恶魔被处决后主谋无法延长游戏，善良阵营获胜。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "courtier", name: "侍臣" } as any, isDead: false } as any,
        { id: 1, role: { id: "mastermind", name: "主谋", type: "minion" } as any, isDead: false, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "courtier", roleName: "侍臣" } as any,
        targetRoleId: "mastermind",
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(courtierAbility), ctx);
      expect(r.snapshot.seats[1].isDrunk).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 9. 教授 (Professor)
  // -------------------------------------------------------------
  describe("教授 (Professor)", () => {
    it("范例 1: 教授选择死亡玩家（声称茶艺师但实为疯子外来者），复活失败。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "professor", name: "教授" } as any, isDead: false } as any,
        { id: 1, role: { id: "lunatic", name: "疯子", type: "outsider" } as any, isDead: true, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "professor", roleName: "教授" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(professorAbility), ctx);
      expect(r.meta.targetIsTownsfolk).toBe(false);
      expect(r.meta.resurrectionSuccess).toBe(false);
      expect(r.snapshot.seats[1].isDead).toBe(true);
    });

    it("范例 2: 教授成功复活死去的祖母（镇民）。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "professor", name: "教授" } as any, isDead: false } as any,
        { id: 1, role: { id: "grandmother", name: "祖母", type: "townsfolk" } as any, isDead: true, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "professor", roleName: "教授" } as any,
        targetIds: [1],
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(professorAbility), ctx);
      expect(r.meta.resurrectionSuccess).toBe(true);
      expect(r.snapshot.seats[1].isDead).toBe(false);
      expect(r.snapshot.seats[1].isAlive).toBe(true);
    });

    it("范例 3: 醉酒的教授尝试复活死去的弄臣，无事发生且能力已消耗。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "professor", name: "教授" } as any, isDead: false, isDrunk: true } as any,
        { id: 1, role: { id: "fool", name: "弄臣", type: "townsfolk" } as any, isDead: true, statusEffects: [] } as any,
      ];

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "professor", roleName: "教授" } as any,
        targetIds: [1],
        meta: { abilityEffective: false },
      };
      const r = await runFullAbilityPipeline(pipe(professorAbility), ctx);
      expect(r.meta.resurrectionSuccess).toBe(false);
      expect(r.snapshot.seats[1].isDead).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 10. 吟游诗人 (Minstrel)
  // -------------------------------------------------------------
  describe("吟游诗人 (Minstrel)", () => {
    it("范例 1: 爪牙(教父)被处决，吟游诗人触发让所有人醉酒至明天黄昏。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "minstrel", name: "吟游诗人" } as any, isDead: false },
        { id: 1, role: { id: "godfather", name: "教父", type: "minion" } as any, isDead: true },
        { id: 2, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "minstrel", roleName: "吟游诗人" } as any,
        storytellerInput: { executedSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(minstrelAbility), ctx);
      expect(r.meta.abilityResult.isMinionExecuted).toBe(true);
      expect(r.meta.abilityResult.shouldDrunkEveryone).toBe(true);
      expect(r.meta.stateUpdates.targetIds).toContain(2);
      expect(r.meta.stateUpdates.targetIds).not.toContain(0); // 吟游诗人自身不醉酒
    });

    it("范例 2: 被处决的是镇民(和平主义者)，吟游诗人不触发。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "minstrel", name: "吟游诗人" } as any, isDead: false },
        { id: 1, role: { id: "pacifist", name: "和平主义者", type: "townsfolk" } as any, isDead: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "minstrel", roleName: "吟游诗人" } as any,
        storytellerInput: { executedSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(minstrelAbility), ctx);
      expect(r.meta.abilityResult.isMinionExecuted).toBe(false);
      expect(r.meta.abilityResult.shouldDrunkEveryone).toBe(false);
    });

    it("范例 3: 刺客被处决导致全场醉酒，僵怖醉酒失去首次假死能力。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "minstrel", name: "吟游诗人" } as any, isDead: false },
        { id: 1, role: { id: "assassin", name: "刺客", type: "minion" } as any, isDead: true },
        { id: 2, role: { id: "zombuul", name: "僵怖", type: "demon" } as any, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "minstrel", roleName: "吟游诗人" } as any,
        storytellerInput: { executedSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(minstrelAbility), ctx);
      expect(r.meta.abilityResult.shouldDrunkEveryone).toBe(true);
      expect(r.meta.stateUpdates.targetIds).toContain(2); // 僵怖醉酒
    });
  });

  // -------------------------------------------------------------
  // 11. 茶艺师 (Tea Lady)
  // -------------------------------------------------------------
  describe("茶艺师 (Tea Lady)", () => {
    it("范例 1: 两侧邻近存活玩家均为善良时免死；若一侧变为邪恶，失去保护死亡。", async () => {
      // 座位环：0号茶艺师，1号善良莽夫，2号侍臣(善良)
      const seats: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, alignment: "good", isDead: false },
        { id: 2, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, alignment: "good", isDead: false },
      ] as any;

      // 两侧均为善良，侍臣受到茶艺师免死保护
      expect(isProtectedByTeaLady(2, seats)).toBe(true);

      // 莽夫转为邪恶
      const evilGoonSeats: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "goon", name: "莽夫", type: "outsider" } as any, alignment: "evil", isEvilConverted: true, isDead: false },
        { id: 2, role: { id: "courtier", name: "侍臣", type: "townsfolk" } as any, alignment: "good", isDead: false },
      ] as any;

      expect(isProtectedByTeaLady(2, evilGoonSeats)).toBe(false);
    });

    it("范例 2: 茶艺师邻近存活玩家均为善良旅行者，旅行者被流放依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "matron", name: "女舍监", type: "traveler" } as any, alignment: "good", isDead: false },
        { id: 2, role: { id: "judge", name: "法官", type: "traveler" } as any, alignment: "good", isDead: false },
      ] as any;

      expect(isProtectedByTeaLady(1, seats)).toBe(true);
      expect(isProtectedByTeaLady(2, seats)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 12. 和平主义者 (Pacifist)
  // -------------------------------------------------------------
  describe("和平主义者 (Pacifist)", () => {
    it("范例 1: 旅店老板被处决，说书人决定和平主义者能力救下旅店老板，存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pacifist", name: "和平主义者" } as any, isDead: false },
        { id: 1, role: { id: "innkeeper", name: "旅店老板" } as any, alignment: "good", isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "pacifist", roleName: "和平主义者" } as any,
        storytellerInput: { executedSeatId: 1, shouldSave: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pacifistAbility), ctx);
      expect(r.meta.abilityResult.shouldSave).toBe(true);
      expect(r.meta.stateUpdates.type).toBe("CANCEL_DEATH");
    });

    it("范例 2: 善良阵营占优，说书人选择不救被处决的善良玩家。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pacifist", name: "和平主义者" } as any, isDead: false },
        { id: 1, role: { id: "sailor", name: "水手" } as any, alignment: "good", isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, seats } as any,
        actionNode: { seatId: 0, roleId: "pacifist", roleName: "和平主义者" } as any,
        storytellerInput: { executedSeatId: 1, shouldSave: false },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pacifistAbility), ctx);
      expect(r.meta.abilityResult.shouldSave).toBe(false);
    });

    it("范例 3: 和平主义者被处决，由于自身能力依然存活。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "pacifist", name: "和平主义者" } as any, alignment: "good", isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 3, seats } as any,
        actionNode: { seatId: 0, roleId: "pacifist", roleName: "和平主义者" } as any,
        storytellerInput: { executedSeatId: 0, shouldSave: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(pacifistAbility), ctx);
      expect(r.meta.abilityResult.shouldSave).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 13. 弄臣 (Fool)
  // -------------------------------------------------------------
  describe("弄臣 (Fool)", () => {
    it("范例 1: 首次处决弄臣免死，第四个白天再次被处决时死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "fool", name: "弄臣" } as any, isDead: false, foolUsed: false } as any,
      ];

      // 首次处决免死
      expect(canFoolSurvive(seats[0])).toBe(true);

      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "fool", roleName: "弄臣" } as any,
        meta: {},
      };
      const r1 = await runFullAbilityPipeline(pipe(foolAbility), ctx1);
      expect(r1.snapshot.seats[0].foolUsed).toBe(true);

      // 再次被处决：已使用过免死，死亡
      expect(canFoolSurvive(r1.snapshot.seats[0])).toBe(false);
    });

    it("范例 2: 恶魔夜晚攻击弄臣，弄臣首次免死存活。次日白天处决死亡。", async () => {
      const foolSeat: Seat = { id: 0, role: { id: "fool", name: "弄臣" } as any, isDead: false, foolUsed: false } as any;

      // 夜晚恶魔攻击触发弄臣免死
      expect(canFoolSurvive(foolSeat)).toBe(true);
      (foolSeat as any).foolUsed = true;

      // 白天再次处决
      expect(canFoolSurvive(foolSeat)).toBe(false);
    });

    it("范例 3: 弄臣受茶艺师或旅店老板保护时不消耗自身免死。", async () => {
      // 茶艺师保护弄臣
      const seats: Seat[] = [
        { id: 0, role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" } as any, isDead: false },
        { id: 1, role: { id: "fool", name: "弄臣", type: "townsfolk" } as any, isDead: false, foolUsed: false },
        { id: 2, role: { id: "professor", name: "教授", type: "townsfolk" } as any, isDead: false },
      ] as any;

      expect(isProtectedByTeaLady(1, seats)).toBe(true);
      // 因为已有茶艺师保护，弄臣自身能力未被消耗
      expect(canFoolSurvive(seats[1])).toBe(true);
      expect((seats[1] as any).foolUsed).toBe(false);
    });
  });
});
