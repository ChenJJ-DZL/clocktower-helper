import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickSunDirection,
  shugenjaAbility,
} from "../../new_engine/shugenja.ability";

const seats: any[] = [
  {
    id: 0,
    playerName: "修验者",
    isDead: false,
    isAlive: true,
    role: { id: "shugenja", name: "修验者", type: "townsfolk" },
    statusEffects: [],
  },
  {
    id: 1,
    playerName: "小恶魔",
    isDead: false,
    isAlive: true,
    role: { id: "imp", name: "小恶魔", type: "demon" },
    statusEffects: [],
  },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("shugenja", actorId, night);

function makeContext(preview: boolean, nightCount = 1): MiddlewareContext {
  return {
    snapshot: {
      nightCount,
      gamePhase: "firstNight",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "shugenja",
      roleName: "1号-修验者",
      priority: 78,
      isFirstNightOnly: true,
      abilityId: "shugenja_sun",
      wakeMessage: "修验者，请睁眼",
      firstNightPriority: 78,
      otherNightPriority: null,
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
      preCheck: shugenjaAbility.preCheck,
      calculate: shugenjaAbility.calculate,
      stateUpdate: shugenjaAbility.stateUpdate,
      postProcess: shugenjaAbility.postProcess,
    },
    ctx
  );

describe("修验者：提示预演与实际执行必须给出同一个太阳方向（回归）", () => {
  it("同种子下两次抽到的方向完全一致", () => {
    const a = pickSunDirection(createDeterministicRandom(seedFor(0, 1)));
    const b = pickSunDirection(createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);
    expect(["左", "右"]).toContain(a);
  });

  it("管道预演（preview）与真实结算给同一个方向", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.shugenjaResult.sunDirection).toBe(
      preview.meta.abilityResult.sunDirection
    );
  });

  it("不同夜次的种子会给出不同方向（跨夜仍然是新的随机结果）", () => {
    const directions = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickSunDirection(createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(directions.size).toBeGreaterThan(1);
  });
});
