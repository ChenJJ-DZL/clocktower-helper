import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { mutantAbility } from "../../new_engine/mutant.ability";

/**
 * 畸形秀演员（Mutant）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 16.畸形秀演员）：
 *   "如果你"疯狂"地证明自己是外来者，你可能被处决。"
 *
 * 实现：
 *   - 暴露检测由 storytellerInput.mutantRevealed 触发
 *   - 暴露后可被说书人立即处决（任何时候，包括夜晚）
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

describe("畸形秀演员：暴露检测 + 立即处决", () => {
  it("未暴露时，calculate 阶段判定为未暴露", async () => {
    const seats: Seat[] = [
      makeSeat(0, "mutant", "outsider"),
      makeSeat(1, "fortune_teller", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "mutant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(mutantAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.mutantRevealed).toBe(false);
    expect(r.canBeExecuted).toBe(false);
  });

  it("暴露时，calculate 阶段判定为已暴露（可立即处决）", async () => {
    const seats: Seat[] = [
      makeSeat(0, "mutant", "outsider"),
      makeSeat(1, "fortune_teller", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "mutant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day" },
      meta: { mutantRevealed: true },
    };
    const res = await runFullAbilityPipeline(pipe(mutantAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.mutantRevealed).toBe(true);
    expect(r.canBeExecuted).toBe(true);
  });

  it("暴露标记经状态更新持久化（供处决联动读取）", async () => {
    const seats: Seat[] = [makeSeat(0, "mutant", "outsider")];
    const res = await runFullAbilityPipeline(pipe(mutantAbility), {
      actionNode: { seatId: 0, roleId: "mutant" },
      targetIds: [],
      snapshot: { seats, gamePhase: "day" },
      meta: {},
      storytellerInput: { mutantRevealed: true },
    } as any);
    // useInteractionHandler 的 toggleStatus("mutant_reveal") 等价于写入该标志
    expect((res.snapshot as any).mutantRevealed).toBe(true);
  });
});
