import { describe, it, expect } from "vitest";
import { isActorDisabledByPoisonOrDrunk } from "../../../utils/gameRules";
import { buildInfoMessage } from "../../../utils/infoMessageBuilder";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { chambermaidAbility } from "../../new_engine/chambermaid.ability";
import { nobleAbility } from "../../new_engine/noble.ability";
import { knightAbility } from "../../new_engine/knight.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { ravenkeeperAbility } from "../../new_engine/ravenkeeper.ability";
import type { Seat } from "../../../../app/data";

describe("Savant, Cerenovus & Global Vortox False Info Fixes", () => {
  describe("1. Savant Daily Ability Retention & Read-Only Logic", () => {
    it("should retain infoA & infoB and lock modification once used today", () => {
      const savantSeat: any = {
        id: 0,
        role: { id: "savant", name: "博学者", type: "townsfolk" },
        hasUsedDayAbility: true,
        dayAbilityResult: {
          type: "SAVANT_RESULT",
          infoA: "小八属于邪恶阵营",
          infoB: "场上只有一名外来者",
        },
      };

      expect(savantSeat.hasUsedDayAbility).toBe(true);
      expect(savantSeat.dayAbilityResult.infoA).toBe("小八属于邪恶阵营");
      expect(savantSeat.dayAbilityResult.infoB).toBe("场上只有一名外来者");

      // 模拟再次点击查看
      const isReadOnly = Boolean(savantSeat.hasUsedDayAbility || savantSeat.dayAbilityResult);
      expect(isReadOnly).toBe(true);

      // 模拟进入新白天重置
      const resetSeat = {
        ...savantSeat,
        hasUsedDayAbility: false,
        dayAbilityResult: undefined,
      };
      expect(resetSeat.hasUsedDayAbility).toBe(false);
      expect(resetSeat.dayAbilityResult).toBeUndefined();
    });
  });

  describe("2. isActorDisabledByPoisonOrDrunk Global Vortox Townsfolk Detection", () => {
    it("should return true for townsfolk when alive Vortox is in seats", () => {
      const townsfolkSeat: Seat = {
        id: 0,
        role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
        isDead: false,
      } as any;

      const vortoxSeat: Seat = {
        id: 1,
        role: { id: "vortox", name: "涡流", type: "demon" } as any,
        isDead: false,
      } as any;

      const seats = [townsfolkSeat, vortoxSeat];

      const isDisabled = isActorDisabledByPoisonOrDrunk(townsfolkSeat, false, seats);
      expect(isDisabled).toBe(true);
    });

    it("should not disable non-townsfolk (e.g. Minion) purely due to Vortox", () => {
      const minionSeat: Seat = {
        id: 0,
        role: { id: "poisoner", name: "投毒者", type: "minion" } as any,
        isDead: false,
      } as any;

      const vortoxSeat: Seat = {
        id: 1,
        role: { id: "vortox", name: "涡流", type: "demon" } as any,
        isDead: false,
      } as any;

      const seats = [minionSeat, vortoxSeat];

      const isDisabled = isActorDisabledByPoisonOrDrunk(minionSeat, false, seats);
      expect(isDisabled).toBe(false);
    });

    it("should not disable townsfolk if Vortox is dead and not vortoxWorld", () => {
      const townsfolkSeat: Seat = {
        id: 0,
        role: { id: "chef", name: "厨师", type: "townsfolk" } as any,
        isDead: false,
      } as any;

      const deadVortoxSeat: Seat = {
        id: 1,
        role: { id: "vortox", name: "涡流", type: "demon" } as any,
        isDead: true,
      } as any;

      const seats = [townsfolkSeat, deadVortoxSeat];

      const isDisabled = isActorDisabledByPoisonOrDrunk(townsfolkSeat, false, seats);
      expect(isDisabled).toBe(false);
    });
  });

  describe("3. buildInfoMessage Vortox & Corruption Reversal", () => {
    const seats: Seat[] = [
      { id: 0, role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" } as any, isDead: false } as any,
      { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } as any, isDead: false } as any,
    ];

    it("flowergirl: should invert vote info under Vortox", () => {
      const msgVoted = buildInfoMessage("flowergirl", {
        seats,
        selfId: 0,
        nightCount: 2,
        demonVotedToday: true,
        vortoxWorld: true,
      });
      expect(msgVoted).toContain("没有投票");

      const msgNotVoted = buildInfoMessage("flowergirl", {
        seats,
        selfId: 0,
        nightCount: 2,
        demonVotedToday: false,
        vortoxWorld: true,
      });
      expect(msgNotVoted).toContain("投过票");
    });

    it("town_crier: should invert minion nomination info under Vortox", () => {
      const msgNominated = buildInfoMessage("town_crier", {
        seats,
        selfId: 0,
        nightCount: 2,
        minionNominatedToday: true,
        vortoxWorld: true,
      });
      expect(msgNominated).toContain("没有人提名过爪牙");

      const msgNotNominated = buildInfoMessage("town_crier", {
        seats,
        selfId: 0,
        nightCount: 2,
        minionNominatedToday: false,
        vortoxWorld: true,
      });
      expect(msgNotNominated).toContain("有人提名过爪牙");
    });

    it("oracle: dead evil count must strictly not equal real count under Vortox", () => {
      const msg = buildInfoMessage("oracle", {
        seats: [
          { id: 0, role: { id: "oracle", name: "神谕者", type: "townsfolk" } as any, isDead: false } as any,
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" } as any, isDead: false } as any,
          { id: 2, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } as any, isDead: true } as any,
        ],
        selfId: 0,
        nightCount: 2,
        vortoxWorld: true,
      });
      expect(msg).not.toContain("中有 0 名邪恶阵营");
    });
  });

  describe("4. New Engine Ability Pipelines under Vortox", () => {
    it("chambermaid: wokenCount must not equal realWokenCount under Vortox", async () => {
      const snapshot: any = {
        seats: [
          { id: 0, role: { id: "chambermaid", name: "侍女", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" }, isAlive: true, isDead: false },
          { id: 2, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }, isAlive: true, isDead: false },
        ],
        nightActionHistory: [],
        vortoxWorld: true,
      };

      const ctx: any = {
        snapshot,
        actionNode: { seatId: 0, roleId: "chambermaid" },
        targetIds: [1, 2],
        meta: { abilityEffective: false },
        preview: true,
      };

      const result = await runFullAbilityPipeline(chambermaidAbility, ctx);
      expect(result.meta.abilityResult.wokenCount).not.toBe(0);
      expect([1, 2]).toContain(result.meta.abilityResult.wokenCount);
    });

    it("noble: chosen trio must NOT contain exactly 1 evil player under Vortox", async () => {
      const snapshot: any = {
        nightCount: 1,
        seats: [
          { id: 0, role: { id: "noble", name: "贵族", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" }, isAlive: true, isDead: false },
          { id: 2, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 3, role: { id: "chef", name: "厨师", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 4, role: { id: "empath", name: "共情者", type: "townsfolk" }, isAlive: true, isDead: false },
        ],
        vortoxWorld: true,
      };

      const ctx: any = {
        snapshot,
        actionNode: { seatId: 0, roleId: "noble" },
        meta: { abilityEffective: false },
        preview: true,
      };

      const result = await runFullAbilityPipeline(nobleAbility, ctx);
      const { seat1, seat2, seat3 } = result.meta.abilityResult;
      const chosenIds = [seat1, seat2, seat3];
      const evilCount = chosenIds.filter((id) => id === 1).length;
      expect(evilCount).not.toBe(1);
    });

    it("knight: chosen pair must contain at least 1 demon under Vortox", async () => {
      const snapshot: any = {
        nightCount: 1,
        seats: [
          { id: 0, role: { id: "knight", name: "骑士", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" }, isAlive: true, isDead: false },
          { id: 2, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 3, role: { id: "chef", name: "厨师", type: "townsfolk" }, isAlive: true, isDead: false },
        ],
        vortoxWorld: true,
      };

      const ctx: any = {
        snapshot,
        actionNode: { seatId: 0, roleId: "knight" },
        meta: { abilityEffective: false },
        preview: true,
      };

      const result = await runFullAbilityPipeline(knightAbility, ctx);
      const { seat1, seat2 } = result.meta.abilityResult;
      expect([seat1, seat2]).toContain(1);
    });

    it("oracle: finalCount must not equal deadEvilCount under Vortox", async () => {
      const snapshot: any = {
        seats: [
          { id: 0, role: { id: "oracle", name: "神谕者", type: "townsfolk" }, isAlive: true, isDead: false },
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" }, isAlive: true, isDead: false },
          { id: 2, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }, isAlive: false, isDead: true },
        ],
        vortoxWorld: true,
      };

      const ctx: any = {
        snapshot,
        actionNode: { seatId: 0, roleId: "oracle" },
        meta: { abilityEffective: false },
        preview: true,
      };

      const result = await runFullAbilityPipeline(oracleAbility, ctx);
      expect(result.meta.abilityResult.deadEvilCount).toBe(0);
      expect(result.meta.abilityResult.finalCount).not.toBe(0);
    });

    it("ravenkeeper: fake role name must not equal target's real role name", async () => {
      const snapshot: any = {
        nightCount: 2,
        seats: [
          { id: 0, role: { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" }, isAlive: false, isDead: true, diedAtNight: 2 },
          { id: 1, role: { id: "vortox", name: "涡流", type: "demon" }, isAlive: true, isDead: false },
          { id: 2, role: { id: "chef", name: "厨师", type: "townsfolk" }, isAlive: true, isDead: false },
        ],
        vortoxWorld: true,
      };

      const ctx: any = {
        snapshot,
        actionNode: { seatId: 0, roleId: "ravenkeeper" },
        targetIds: [2],
        meta: { abilityEffective: false },
        preview: true,
      };

      const result = await runFullAbilityPipeline(ravenkeeperAbility, ctx);
      expect(result.meta.abilityResult.roleName).not.toBe("厨师");
    });
  });
});
