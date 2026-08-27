import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { ravenkeeperAbility } from "../../new_engine/ravenkeeper.ability";

function s(
  id: number,
  rid: string,
  rt: string,
  o?: { dead?: boolean; diedAtNight?: number; markedForDeath?: boolean }
) {
  const n: Record<string, string> = {
    ravenkeeper: "守鸦人",
    chef: "厨师",
    imp: "小恶魔",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!o?.dead,
    isAlive: !o?.dead,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: [],
    hasAbilityEvenDead: false,
    diedAtNight: o?.diedAtNight,
    markedForDeath: o?.markedForDeath,
  };
}
function ctx(
  sid: number,
  nc: number,
  phase: string,
  seats: ReturnType<typeof s>[]
): MiddlewareContext {
  return {
    snapshot: { nightCount: nc, gamePhase: phase, seats, statusEffects: {} },
    actionNode: {
      seatId: sid,
      roleId: "ravenkeeper",
      roleName: "守鸦者",
      priority: 80,
      isFirstNightOnly: false,
      abilityId: "rk_night",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: 80,
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
describe("守鸦人 引擎集成测试", () => {
  test("夜死时触发", async () => {
    const r = await runFullAbilityPipeline(
      pipe(ravenkeeperAbility),
      ctx(0, 2, "night", [
        s(0, "ravenkeeper", "townsfolk", { dead: true, diedAtNight: 2 }),
        s(1, "chef", "townsfolk"),
      ])
    );
    expect(r.aborted).toBe(false);
  });
  test("白天死亡不触发", async () => {
    const r = await runFullAbilityPipeline(
      pipe(ravenkeeperAbility),
      ctx(0, 2, "night", [
        s(0, "ravenkeeper", "townsfolk", { dead: true }),
        s(1, "imp", "demon"),
      ])
    );
    expect(r.aborted).toBe(true);
  });
  test("存活时不触发", async () => {
    const r = await runFullAbilityPipeline(
      pipe(ravenkeeperAbility),
      ctx(0, 2, "night", [
        s(0, "ravenkeeper", "townsfolk"),
        s(1, "chef", "townsfolk"),
      ])
    );
    expect(r.aborted).toBe(true);
  });
});
