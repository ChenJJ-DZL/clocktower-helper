import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { savantAbility } from "../../new_engine/savant.ability";

/**
 * 博学者（Savant）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 10.博学者）：
 *   "每个白天，你可以私下询问说书人以得知两条信息：
 *    一个是正确的，一个是错误的。"
 *
 * 实现：storytellerInput.result 提供 1 真 1 假两条信息；
 *    醉酒/中毒时可能两条都对或两条都错。
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

describe("博学者：每日一真一假信息", () => {
  it("正常：说书人提供 1 真 1 假两条信息", async () => {
    const seats: Seat[] = [makeSeat(0, "savant", "townsfolk")];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "savant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day", dayCount: 1 },
      meta: {},
      storytellerInput: {
        result: {
          correct: "恶魔是 3 号玩家",
          incorrect: "5 号是外来者",
        },
      },
    };
    const res = await runFullAbilityPipeline(pipe(savantAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.correct).toBe("恶魔是 3 号玩家");
    expect(r.incorrect).toBe("5 号是外来者");
  });

  it("醉酒/中毒：默认两条都是假", async () => {
    const seats: Seat[] = [
      makeSeat(0, "savant", "townsfolk", { isDrunk: true }),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "savant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day", dayCount: 1 },
      meta: { abilityEffective: false },
      storytellerInput: {
        fakeResult: {
          correct: "虚假信息1",
          incorrect: "虚假信息2",
        },
      },
    };
    const res = await runFullAbilityPipeline(pipe(savantAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.correct).toBe("虚假信息1");
    expect(r.incorrect).toBe("虚假信息2");
  });
});
