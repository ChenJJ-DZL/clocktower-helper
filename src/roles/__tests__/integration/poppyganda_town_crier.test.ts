import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { town_crierAbility } from "../../new_engine/town_crier.ability";

/**
 * 城镇公告员（Town Crier）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 8.城镇公告员）：
 *   "每个夜晚*，你会得知在今天白天时是否有爪牙发起过提名。"
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("城镇公告员：每夜得知白天是否有爪牙提名", () => {
  it("白天无爪牙提名 → 告知「否」", async () => {
    const seats: Seat[] = [
      makeSeat(0, "town_crier", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "librarian", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "town_crier" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        minionNominatedToday: false, // 白天无爪牙提名
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(town_crierAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.minionNominated).toBe(false);
  });

  it("白天有爪牙提名 → 告知「是」", async () => {
    const seats: Seat[] = [
      makeSeat(0, "town_crier", "townsfolk"),
      makeSeat(1, "washerwoman", "townsfolk"),
      makeSeat(2, "poisoner", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "town_crier" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        minionNominatedToday: true, // 白天有爪牙提名
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(town_crierAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.minionNominated).toBe(true);
  });

  it("醉酒/中毒：反馈反向信息", async () => {
    const drunkCrier = makeSeat(0, "town_crier", "townsfolk");
    (drunkCrier as any).statusEffects = [{ type: "drunk" }];
    const seats: Seat[] = [drunkCrier];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "town_crier" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        minionNominatedToday: true,
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(town_crierAbility), ctx);
    const r = res.meta.abilityResult as any;
    // 醉酒/中毒 → 反向
    expect(r.minionNominated).toBe(false);
    expect(res.meta.isCorrupted).toBe(true);
  });
});
