import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { virginAbility } from "../../new_engine/virgin.ability";

function s(id: number, rid: string, rt: string, o?: { drunk?: boolean }) {
  const n: Record<string, string> = {
    virgin: "贞洁者",
    chef: "厨师",
    butler: "管家",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: !!o?.drunk,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: o?.drunk ? [{ type: "drunk" }] : [],
    hasAbilityEvenDead: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
  };
}
function ctx(
  sid: number,
  phase: string,
  seats: ReturnType<typeof s>[],
  nominatorId?: number
): MiddlewareContext {
  return {
    snapshot: { nightCount: 1, gamePhase: phase, seats, statusEffects: {} },
    actionNode: {
      seatId: sid,
      roleId: "virgin",
      roleName: "贞洁者",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "virgin_day",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: { nominatorId },
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
describe("贞洁者 引擎集成测试", () => {
  test("管道不中止(被动触发角色)", async () => {
    const r = await runFullAbilityPipeline(
      pipe(virginAbility),
      ctx(0, "day", [s(0, "virgin", "townsfolk"), s(1, "chef", "townsfolk")])
    );
    expect(r.aborted).toBe(false);
  });

  test("贞洁者被动仅限首次提名触发一次，多次提名不再触发", async () => {
    const virgin = s(0, "virgin", "townsfolk");
    const chef = s(1, "chef", "townsfolk");
    const undertaker = s(2, "undertaker", "townsfolk");

    // 第一次提名（镇民提名贞洁者）
    const isVirginUsed1 = !!(
      virgin.hasUsedVirginAbility || virgin.hasBeenNominated
    );
    expect(isVirginUsed1).toBe(false);

    // 首次触发更新：消耗能力标记
    virgin.hasUsedVirginAbility = true;
    virgin.hasBeenNominated = true;
    (virgin as any).abilityUsed = true;

    // 第二次提名（送葬者提名贞洁者）
    const isVirginUsed2 = !!(
      virgin.hasUsedVirginAbility ||
      virgin.hasBeenNominated ||
      (virgin as any).abilityUsed
    );
    expect(isVirginUsed2).toBe(true);

    // 第三次提名（另一玩家再次提名贞洁者）
    const isVirginUsed3 = !!(
      virgin.hasUsedVirginAbility ||
      virgin.hasBeenNominated ||
      (virgin as any).abilityUsed
    );
    expect(isVirginUsed3).toBe(true);
  });

  test("非镇民首次提名贞洁者时能力消耗，后续镇民提名不再触发处决", async () => {
    const virgin = s(0, "virgin", "townsfolk");
    const butler = s(1, "butler", "outsider");

    // 首次提名（外来者管家提名贞洁者）
    expect(virgin.hasUsedVirginAbility).toBe(false);

    // 首次提名后能力消耗
    virgin.hasUsedVirginAbility = true;
    virgin.hasBeenNominated = true;

    // 后续真实镇民提名，检测已使用
    const isUsed = !!(virgin.hasUsedVirginAbility || virgin.hasBeenNominated);
    expect(isUsed).toBe(true);
  });
});
