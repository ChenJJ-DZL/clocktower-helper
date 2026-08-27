import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { soldierAbility } from "../../new_engine/soldier.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = { soldier: "士兵", imp: "小恶魔" };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    role: { id: rid, name: n[rid] || rid, type: rt },
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "night",
      seats: [s(0, "soldier", "townsfolk"), s(1, "imp", "demon")],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "soldier",
      roleName: "士兵",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "soldier_passive",
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
describe("士兵 引擎集成测试", () => {
  test("被动能力管道不中止", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(soldierAbility), ctx(0))).aborted
    ).toBe(false);
  });
});
