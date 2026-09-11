import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickDrunkIdWhenInactive,
  sailorAbility,
} from "../../new_engine/sailor.ability";

// 最小 5 人局：水手 0、厨师 1、士兵 2、圣徒 3、小恶魔 4
const seats: any[] = [
  {
    id: 0,
    playerName: "水手",
    isDead: false,
    isAlive: true,
    role: { id: "sailor", name: "水手", type: "townsfolk" },
    statusEffects: [],
  },
  {
    id: 1,
    playerName: "厨师",
    isDead: false,
    isAlive: true,
    role: { id: "chef", name: "厨师", type: "townsfolk" },
    statusEffects: [],
  },
  {
    id: 2,
    playerName: "士兵",
    isDead: false,
    isAlive: true,
    role: { id: "soldier", name: "士兵", type: "townsfolk" },
    statusEffects: [],
  },
  {
    id: 3,
    playerName: "圣徒",
    isDead: false,
    isAlive: true,
    role: { id: "saint", name: "圣徒", type: "outsider" },
    statusEffects: [],
  },
  {
    id: 4,
    playerName: "小恶魔",
    isDead: false,
    isAlive: true,
    role: { id: "imp", name: "小恶魔", type: "demon" },
    statusEffects: [],
  },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("sailor", actorId, night);

/**
 * 水手的能力失效（醉酒/中毒）时才会走「随机挑一个醉酒对象」分支，
 * 因此场景固定为「水手中毒」。
 */
function makeContext(
  preview: boolean,
  nightCount = 1,
  targetId = 1
): MiddlewareContext {
  const sceneSeats = seats.map((s) => ({ ...s, statusEffects: [...s.statusEffects] }));
  sceneSeats[0].statusEffects = [{ type: "poisoned" }];
  return {
    snapshot: {
      nightCount,
      gamePhase: nightCount === 1 ? "firstNight" : "night",
      seats: sceneSeats,
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "sailor",
      roleName: "1号-水手",
      priority: 23,
      isFirstNightOnly: false,
      abilityId: "sailor_night_ability",
      wakeMessage: "水手，请睁眼",
      firstNightPriority: 23,
      otherNightPriority: 8,
      targetIds: [targetId],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [targetId],
    meta: {},
    aborted: false,
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: sailorAbility.preCheck,
      calculate: sailorAbility.calculate,
      stateUpdate: sailorAbility.stateUpdate,
      postProcess: sailorAbility.postProcess,
    },
    ctx
  );

describe("水手：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("能力失效时随机选醉酒者，同种子下结果完全一致", () => {
    const a = pickDrunkIdWhenInactive(
      0,
      1,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickDrunkIdWhenInactive(
      0,
      1,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toBe(a);
    expect([0, 1]).toContain(a);
  });

  it("管道预演（preview）与真实结算给同一个醉酒对象", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.stateUpdates.targetId).toBe(
      preview.meta.abilityResult.drunkId
    );
  });

  it("不同夜次的种子会重新随机（跨夜仍然是新的随机结果）", () => {
    const drunkIds = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickDrunkIdWhenInactive(0, 1, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(drunkIds.size).toBeGreaterThan(1);
  });
});
