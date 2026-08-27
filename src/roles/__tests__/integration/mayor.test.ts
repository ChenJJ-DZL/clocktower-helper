import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { mayorAbility } from "../../new_engine/mayor.ability";

function s(id: number, rid: string, rt: string) {
  const n: Record<string, string> = {
    mayor: "镇长",
    imp: "小恶魔",
    soldier: "士兵",
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
const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});
describe("镇长 引擎集成测试", () => {
  test("替死触发时管道执行", async () => {
    const ctx: MiddlewareContext = {
      snapshot: {
        nightCount: 3,
        gamePhase: "night",
        seats: [
          s(0, "mayor", "townsfolk"),
          s(1, "imp", "demon"),
          s(2, "soldier", "townsfolk"),
        ],
        statusEffects: {},
      },
      actionNode: {
        seatId: 0,
        roleId: "mayor",
        roleName: "镇长",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "m",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [],
      meta: { isMayorDying: true },
      aborted: false,
    };
    expect(
      (await runFullAbilityPipeline(pipe(mayorAbility), ctx)).aborted
    ).toBe(false);
  });
  test("未被攻击时不触发", async () => {
    const ctx: MiddlewareContext = {
      snapshot: {
        nightCount: 3,
        gamePhase: "night",
        seats: [s(0, "mayor", "townsfolk"), s(1, "imp", "demon")],
        statusEffects: {},
      },
      actionNode: {
        seatId: 0,
        roleId: "mayor",
        roleName: "镇长",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "m",
        wakeMessage: "",
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
    expect(
      (await runFullAbilityPipeline(pipe(mayorAbility), ctx)).aborted
    ).toBe(true);
  });
});
