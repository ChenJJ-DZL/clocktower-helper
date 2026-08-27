import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { impAbility } from "../../new_engine/imp.ability";

function s(id: number, rid: string, rt: string, o?: { dead?: boolean }) {
  const n: Record<string, string> = {
    imp: "小恶魔",
    soldier: "士兵",
    poisoner: "投毒者",
    chef: "厨师",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!o?.dead,
    isAlive: !o?.dead,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number, nc: number, targetIds: number[]): MiddlewareContext {
  return {
    snapshot: {
      nightCount: nc,
      gamePhase: nc === 1 ? "firstNight" : "night",
      seats: [
        s(0, "imp", "demon"),
        s(1, "soldier", "townsfolk"),
        s(2, "poisoner", "minion"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "imp",
      roleName: "小恶魔",
      priority: 45,
      isFirstNightOnly: false,
      abilityId: "imp_kill",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: 45,
      targetIds,
      processed: false,
      success: false,
      meta: {},
    },
    targetIds,
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
describe("小恶魔 引擎集成测试", () => {
  test("非首夜杀人", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 2, [1]))).aborted
    ).toBe(false);
  });
  test("首夜不杀人(知爪牙)", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 1, []))).aborted
    ).toBe(true);
  });
  test("自杀传位给爪牙", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(impAbility), ctx(0, 2, [0]))).aborted
    ).toBe(false);
  });
});
