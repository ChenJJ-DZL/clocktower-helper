import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { jugglerAbility } from "../../new_engine/juggler.ability";

/**
 * 杂耍艺人（Juggler）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 9.杂耍艺人）：
 *   "在你的首个白天，你可以公开猜测任意玩家的角色最多五次。
 *    在当晚，你会得知你猜对的次数……如果你没有被杀害的话。"
 *
 * 实现：
 *   - triggerTiming: FIRST_NIGHT（次夜告知猜对数）
 *   - 能力仅在首个白天（dayCount === 1）触发
 *   - 每局一次（LimitedAbilityManager）
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

describe("杂耍艺人：首日守卫 + 5 次猜测", () => {
  it("次夜自动告知猜对数（基于 jugglerGuesses 计算）", async () => {
    resetLimitedAbilityUses();
    const seats: Seat[] = [
      makeSeat(0, "juggler", "townsfolk"),
      makeSeat(1, "fortune_teller", "townsfolk"),
      makeSeat(2, "monk", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "juggler" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 2,
        jugglerGuesses: [
          { targetSeatId: 1, roleId: "fortune_teller" }, // 对
          { targetSeatId: 2, roleId: "monk" }, // 对
        ],
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(jugglerAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.correctCount).toBe(2); // 两个都猜对
  });

  it("非首个白天调用 → 能力应被 abort", async () => {
    resetLimitedAbilityUses();
    const seats: Seat[] = [makeSeat(0, "juggler", "townsfolk")];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "juggler" },
      targetIds: [],
      snapshot: {
        seats,
        gamePhase: "night",
        dayCount: 2, // 不是首个白天
        jugglerGuesses: {},
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(jugglerAbility), ctx);
    expect(res.aborted).toBe(true);
  });
});
