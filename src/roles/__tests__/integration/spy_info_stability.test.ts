import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  buildGrimoireData,
  spyAbility,
} from "../../new_engine/spy.ability";

// 最小 6 人局
const seats: any[] = [
  { id: 0, playerName: "间谍", isDead: false, isAlive: true, role: { id: "spy", name: "间谍", type: "minion" }, statusEffects: [] },
  { id: 1, playerName: "洗衣妇", isDead: false, isAlive: true, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" }, statusEffects: [] },
  { id: 2, playerName: "厨师", isDead: false, isAlive: true, role: { id: "chef", name: "厨师", type: "townsfolk" }, statusEffects: [] },
  { id: 3, playerName: "圣徒", isDead: false, isAlive: true, role: { id: "saint", name: "圣徒", type: "outsider" }, statusEffects: [] },
  { id: 4, playerName: "投毒者", isDead: false, isAlive: true, role: { id: "poisoner", name: "投毒者", type: "minion" }, statusEffects: [] },
  { id: 5, playerName: "小恶魔", isDead: false, isAlive: true, role: { id: "imp", name: "小恶魔", type: "demon" }, statusEffects: [] },
];

const snapshot: any = { _abilityResults: {}, seats };

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("spy", actorId, night);

/** 魔典被混淆后的角色分配（用于比对「同一份魔典」） */
const roleMapOf = (grimoire: any) =>
  JSON.stringify(
    grimoire.players.map((p: any) => [p.seatId, p.roleId, p.roleName])
  );

function makeContext(preview: boolean, nightCount = 2): MiddlewareContext {
  const sceneSeats = seats.map((s) => ({
    ...s,
    statusEffects: [...s.statusEffects],
  }));
  // 间谍中毒 → 展示的魔典内容会被混淆（随机交换角色）
  sceneSeats[0].statusEffects = [{ type: "poisoned" }];
  return {
    snapshot: {
      nightCount,
      gamePhase: "night",
      seats: sceneSeats,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "spy",
      roleName: "1号-间谍",
      priority: 108,
      isFirstNightOnly: false,
      abilityId: "spy_night_ability",
      wakeMessage: "间谍，请睁眼查看魔典",
      firstNightPriority: 75,
      otherNightPriority: 108,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: spyAbility.preCheck,
      calculate: spyAbility.calculate,
      stateUpdate: spyAbility.stateUpdate,
      postProcess: spyAbility.postProcess,
    },
    ctx
  );

describe("间谍：提示预演与实际执行必须展示同一份魔典（回归）", () => {
  it("受干扰时同种子下两次生成的魔典完全相同", () => {
    const a = buildGrimoireData(
      seats,
      snapshot,
      2,
      true,
      createDeterministicRandom(seedFor(0, 2))
    );
    const b = buildGrimoireData(
      seats,
      snapshot,
      2,
      true,
      createDeterministicRandom(seedFor(0, 2))
    );
    expect(b).toEqual(a);
    expect(a.isCorrupted).toBe(true);
    // 混淆确实发生了：至少一名玩家的角色与真实角色不同
    const swapped = a.players.some(
      (p: any) => p.roleId !== seats.find((s) => s.id === p.seatId)?.role.id
    );
    expect(swapped).toBe(true);
  });

  it("不同夜次的种子会重新随机（跨夜仍然是新的随机结果）", () => {
    const maps = new Set(
      [2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
        roleMapOf(
          buildGrimoireData(
            seats,
            snapshot,
            n,
            true,
            createDeterministicRandom(seedFor(0, n))
          )
        )
      )
    );
    expect(maps.size).toBeGreaterThan(1);
  });

  it("管道预演（preview）与真实结算展示同一份魔典", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.grimoireData).toEqual(preview.meta.grimoireData);
    expect(execute.meta.displayInfo.grimoire.isCorrupted).toBe(
      preview.meta.grimoireData.isCorrupted
    );
  });
});
