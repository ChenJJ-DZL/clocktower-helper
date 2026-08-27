import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { drunkAbility } from "../../new_engine/drunk.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = { drunk: "酒鬼", empath: "共情者" };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: true,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: { id: "empath", name: "共情者", type: "townsfolk" },
    statusEffects: [{ type: "drunk" }],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [s(0, "drunk", "outsider"), s(1, "empath", "townsfolk")],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "drunk",
      roleName: "酒鬼",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "drunk_passive",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
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
describe("酒鬼 引擎集成测试", () => {
  test("酒鬼被动管道不中止", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(drunkAbility), ctx(0))).aborted
    ).toBe(false);
  });
});
