import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { spyAbility } from "../../new_engine/spy.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = {
    spy: "间谍",
    imp: "小恶魔",
    poisoner: "投毒者",
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
      seats: [
        s(0, "spy", "minion"),
        s(1, "chef", "townsfolk"),
        s(2, "imp", "demon"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "spy",
      roleName: "间谍",
      priority: 60,
      isFirstNightOnly: false,
      abilityId: "spy_night",
      wakeMessage: "...",
      firstNightPriority: 60,
      otherNightPriority: 60,
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
describe("间谍 引擎集成测试", () => {
  test("每夜查看魔典", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(spyAbility), ctx(0, 1))).aborted
    ).toBe(false);
  });
});
