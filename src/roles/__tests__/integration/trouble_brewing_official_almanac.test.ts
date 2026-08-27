import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { resolveMayorDemonKill } from "../../../utils/soldierImmunity";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { undertakerAbility } from "../../new_engine/undertaker.ability";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

function createSeat(
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  options: any = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!options.isDead,
    isAlive: !options.isDead,
    isDrunk: !!options.isDrunk,
    isPoisoned: !!options.isPoisoned,
    role: { id: roleId, name: roleName, type: roleType },
    effectiveRole: null,
    charadeRole: options.charadeRole || null,
    statusEffects: options.statusEffects || [],
    executedToday: !!options.executedToday,
    hasAbilityEvenDead: false,
    ...options,
  };
}

describe("《暗流涌动》(Trouble Brewing) 官方百科深度规则与用户调整测试", () => {
  describe("1. 红唇女郎 (Scarlet Woman) 恶魔继任判定", () => {
    it("恶魔死前恰有 5 人存活（死后剩余 4 名幸存者，不含旅行者）：红唇女郎立刻变成恶魔", async () => {
      // 5 人局：恶魔死亡后，场上剩余 4 名存活玩家（红唇女郎 + 3 镇民）
      const seats = [
        createSeat(0, "scarlet_woman", "红唇女郎", "minion"),
        createSeat(1, "imp", "小恶魔", "demon", { isDead: true }),
        createSeat(2, "soldier", "士兵", "townsfolk"),
        createSeat(3, "chef", "厨师", "townsfolk"),
        createSeat(4, "washerwoman", "洗衣妇", "townsfolk"),
      ];

      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "scarlet_woman",
          roleName: "红唇女郎",
          priority: 0,
          isFirstNightOnly: false,
          abilityId: "sw_passive",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const result = await runFullAbilityPipeline(
        pipe(scarletWomanAbility),
        ctx
      );
      expect(result.aborted).toBe(false);
      const swSeat = result.snapshot.seats.find((s: any) => s.id === 0);
      expect(swSeat.role.id).toBe("imp");
      expect(swSeat.role.type).toBe("demon");
      expect(swSeat.isDemonSuccessor).toBe(true);
    });

    it("恶魔死前少于 5 人存活（死后剩余 3 名幸存者）：红唇女郎不继任，技能终止", async () => {
      // 恶魔死后剩余 3 人（红唇女郎 + 2 镇民）
      const seats = [
        createSeat(0, "scarlet_woman", "红唇女郎", "minion"),
        createSeat(1, "imp", "小恶魔", "demon", { isDead: true }),
        createSeat(2, "soldier", "士兵", "townsfolk"),
        createSeat(3, "chef", "厨师", "townsfolk"),
      ];

      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "scarlet_woman",
          roleName: "红唇女郎",
          priority: 0,
          isFirstNightOnly: false,
          abilityId: "sw_passive",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const result = await runFullAbilityPipeline(
        pipe(scarletWomanAbility),
        ctx
      );
      expect(result.aborted).toBe(true);
    });
  });

  describe("2. 送葬者 (Undertaker) 查验死去的酒鬼", () => {
    it("今天白天死于处决的玩家是酒鬼（以为自己是修女/僧侣）：送葬者得知真实角色【酒鬼】", async () => {
      const seats = [
        createSeat(0, "undertaker", "送葬者", "townsfolk"),
        createSeat(1, "drunk", "酒鬼", "outsider", {
          isDead: true,
          executedToday: true,
          charadeRole: { id: "monk", name: "僧侣", type: "townsfolk" },
        }),
        createSeat(2, "imp", "小恶魔", "demon"),
        createSeat(3, "chef", "厨师", "townsfolk"),
      ];

      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          todayExecutedId: 1,
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "undertaker",
          roleName: "送葬者",
          priority: 14,
          isFirstNightOnly: false,
          abilityId: "undertaker_night_ability",
          targetIds: [],
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [],
        meta: {},
        aborted: false,
      };

      const result = await runFullAbilityPipeline(pipe(undertakerAbility), ctx);
      expect(result.aborted).toBe(false);
      expect(result.meta.abilityResult.roleName).toBe("酒鬼");
    });
  });

  describe("3. 镇长 (Mayor) 恶魔夜杀弹刀替死机制", () => {
    it("镇长被恶魔夜杀时，可弹刀给场上除镇长外的任意存活玩家（如外来者/爪牙/其他镇民）", () => {
      const seats = [
        createSeat(0, "mayor", "镇长", "townsfolk"),
        createSeat(1, "butler", "管家", "outsider"), // 外来者作为候选替死
        createSeat(2, "poisoner", "投毒者", "minion"), // 爪牙作为候选替死
        createSeat(3, "imp", "小恶魔", "demon"),
      ];

      const mayorSeat = seats[0];
      const result = resolveMayorDemonKill(seats, mayorSeat, 4, 0.5); // forcedRoll 0.5 (触发替死)

      expect(result.isMayor).toBe(true);
      expect(result.substituted).toBe(true);
      expect(result.substituteSeat).toBeDefined();
      expect(result.substituteSeat.id).not.toBe(0); // 不是镇长自己
    });
  });

  describe("4. 小恶魔 (Imp) 自杀传刀机制", () => {
    it("小恶魔自杀不受人数限制（即使全场仅剩 3 人），有存活爪牙即可传刀，优先红唇女郎", async () => {
      const { impAbility } = await import("../../new_engine/imp.ability");

      // 3人局（小恶魔 + 红唇女郎 + 士兵）
      const seats = [
        createSeat(0, "imp", "小恶魔", "demon"),
        createSeat(1, "scarlet_woman", "红唇女郎", "minion"),
        createSeat(2, "soldier", "士兵", "townsfolk"),
      ];

      const ctx: MiddlewareContext = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          statusEffects: {},
        } as any,
        actionNode: {
          seatId: 0,
          roleId: "imp",
          roleName: "小恶魔",
          priority: 20,
          isFirstNightOnly: false,
          abilityId: "imp_night_kill",
          targetIds: [0], // 自杀目标为自己
          processed: false,
          success: false,
          meta: {},
        } as any,
        targetIds: [0],
        meta: {},
        aborted: false,
      };

      const result = await runFullAbilityPipeline(pipe(impAbility), ctx);
      expect(result.aborted).toBe(false);

      // 原小恶魔标记死亡
      const oldImp = result.snapshot.seats.find((s: any) => s.id === 0);
      expect(oldImp.markedForDeath).toBe(true);

      // 存活爪牙（红唇女郎）晋升为新小恶魔
      const newImp = result.snapshot.seats.find((s: any) => s.id === 1);
      expect(newImp.role.id).toBe("imp");
      expect(newImp.role.type).toBe("demon");
      expect(newImp.isDemonSuccessor).toBe(true);
    });
  });
});
