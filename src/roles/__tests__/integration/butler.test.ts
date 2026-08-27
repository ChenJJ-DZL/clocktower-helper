import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { butlerAbility } from "../../new_engine/butler.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = {
    butler: "管家",
    mayor: "镇长",
    chef: "厨师",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number, nc: number): MiddlewareContext {
  return {
    snapshot: {
      nightCount: nc,
      gamePhase: nc === 1 ? "firstNight" : "night",
      seats: [s(0, "butler", "outsider"), s(1, "mayor", "townsfolk")],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "butler",
      roleName: "管家",
      priority: 70,
      isFirstNightOnly: false,
      abilityId: "butler_night",
      wakeMessage: "...",
      firstNightPriority: 70,
      otherNightPriority: 70,
      targetIds: [1],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [1],
    meta: {},
    aborted: false,
  };
}
const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});
describe("管家 引擎集成测试", () => {
  test("首夜行动", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(butlerAbility), ctx(0, 1))).aborted
    ).toBe(false);
  });
  test("非首夜行动", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(butlerAbility), ctx(0, 2))).aborted
    ).toBe(false);
  });
  test("管家选择自己作为主人时应中止行动", async () => {
    const selfCtx = ctx(0, 1);
    selfCtx.targetIds = [0];
    const result = await runFullAbilityPipeline(pipe(butlerAbility), selfCtx);
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toBe("管家不能选择自己作为主人");
  });
});
