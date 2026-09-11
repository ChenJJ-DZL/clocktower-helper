import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickSwapTargetId,
  trickster_jackAbility,
} from "../../new_engine/trickster_jack.ability";

// 最小 5 人局：恶作剧杰克 0 + 3 名存活其他玩家 + 1 名已死亡玩家
const seats: any[] = [
  { id: 0, playerName: "恶作剧杰克", isDead: false, isAlive: true, role: { id: "trickster_jack", name: "恶作剧杰克", type: "townsfolk" }, statusEffects: [] },
  { id: 1, playerName: "厨师", isDead: false, isAlive: true, role: { id: "chef", name: "厨师", type: "townsfolk" }, statusEffects: [] },
  { id: 2, playerName: "士兵", isDead: false, isAlive: true, role: { id: "soldier", name: "士兵", type: "townsfolk" }, statusEffects: [] },
  { id: 3, playerName: "圣徒", isDead: false, isAlive: true, role: { id: "saint", name: "圣徒", type: "outsider" }, statusEffects: [] },
  { id: 4, playerName: "已死者", isDead: true, isAlive: false, role: { id: "imp", name: "小恶魔", type: "demon" }, statusEffects: [] },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("trickster_jack", actorId, night);

function makeContext(preview: boolean, nightCount = 2): MiddlewareContext {
  return {
    snapshot: {
      nightCount,
      gamePhase: "day",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "trickster_jack",
      roleName: "1号-恶作剧杰克",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "trickster_jack_passive",
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
    preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: trickster_jackAbility.preCheck,
      calculate: trickster_jackAbility.calculate,
      stateUpdate: trickster_jackAbility.stateUpdate,
      postProcess: trickster_jackAbility.postProcess,
    },
    ctx
  );

describe("恶作剧杰克：提示预演与实际执行必须挑中同一名交换对象（回归）", () => {
  it("同种子下两次挑中的交换对象完全一致", () => {
    const a = pickSwapTargetId(
      seats,
      0,
      createDeterministicRandom(seedFor(0, 2))
    );
    const b = pickSwapTargetId(
      seats,
      0,
      createDeterministicRandom(seedFor(0, 2))
    );
    expect(b).toBe(a);
    // 只会挑存活的他人，绝不会挑自己或已死玩家
    expect([1, 2, 3]).toContain(a);
  });

  it("没有可交换对象时返回 null", () => {
    const onlySelf = [seats[0]];
    expect(
      pickSwapTargetId(onlySelf, 0, createDeterministicRandom(seedFor(0, 2)))
    ).toBeNull();
  });

  it("不同夜次的种子会重新随机（跨夜仍然是新的随机结果）", () => {
    const targets = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickSwapTargetId(seats, 0, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(targets.size).toBeGreaterThan(1);
  });

  it("管道预演（preview）与真实结算挑中同一名玩家", async () => {
    const preview = await run(makeContext(true));
    const execute = await run(makeContext(false));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.prompt).toContain(
      `${preview.meta.abilityResult.targetId + 1}号`
    );
  });
});
