import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { poisonerAbility } from "../../new_engine/poisoner.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = {
    poisoner: "投毒者",
    chef: "厨师",
    butler: "管家",
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
function ctx(sid: number): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [s(0, "poisoner", "minion"), s(1, "chef", "townsfolk")],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "poisoner",
      roleName: "投毒者",
      priority: 20,
      isFirstNightOnly: false,
      abilityId: "poisoner_night",
      wakeMessage: "...",
      firstNightPriority: 20,
      otherNightPriority: 20,
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
describe("投毒者 引擎集成测试", () => {
  test("首夜行动管道执行", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(poisonerAbility), ctx(0))).aborted
    ).toBe(false);
  });
});
