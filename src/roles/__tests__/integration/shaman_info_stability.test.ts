import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickKeyword,
  shamanAbility,
} from "../../new_engine/shaman.ability";

const seats: any[] = [
  {
    id: 0,
    playerName: "灵言师",
    isDead: false,
    isAlive: true,
    role: { id: "shaman", name: "灵言师", type: "minion" },
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
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("shaman", actorId, night);

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
      roleId: "shaman",
      roleName: "1号-灵言师",
      priority: 0,
      isFirstNightOnly: true,
      abilityId: "shaman_night_ability",
      wakeMessage: "灵言师，请睁眼",
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
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: shamanAbility.preCheck,
      calculate: shamanAbility.calculate,
      stateUpdate: shamanAbility.stateUpdate,
      postProcess: shamanAbility.postProcess,
    },
    ctx
  );

describe("灵言师：提示预演与实际执行必须给出同一个关键词（回归）", () => {
  it("同种子下两次抽到的关键词完全一致", () => {
    const a = pickKeyword(createDeterministicRandom(seedFor(0, 1)));
    const b = pickKeyword(createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });

  it("管道预演（preview）与真实结算给同一个关键词", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.abilityResult.keyword).toBe(
      preview.meta.abilityResult.keyword
    );
  });

  it("不同夜次的种子会给出不同关键词（跨夜仍然是新的随机结果）", () => {
    const keywords = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickKeyword(createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(keywords.size).toBeGreaterThan(1);
  });
});
