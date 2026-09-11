import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  mathematicianAbility,
  pickFakeAbnormalCount,
} from "../../new_engine/mathematician.ability";

// 数学家：每夜被动得知一个数字。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("mathematician", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  mathematician: "数学家",
  empath: "共情者",
  chef: "厨师",
  imp: "小恶魔",
};

function seat(id: number, roleId: string, type: string, poisoned = false) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: poisoned,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: poisoned ? [{ type: "poisoned" }] : [],
  };
}

function makeCtx(opts: { preview?: boolean; poisoned?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      // 说书人/GameController 提供的真实异常次数
      abnormalAbilityCount: 3,
      seats: [
        seat(0, "mathematician", "townsfolk", !!opts.poisoned),
        seat(1, "empath", "townsfolk"),
        seat(2, "chef", "townsfolk"),
        seat(3, "imp", "demon"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "mathematician",
      roleName: "数学家",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "mathematician_count",
      wakeMessage: "",
      firstNightPriority: 84,
      otherNightPriority: 116,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    storytellerInput: {},
    meta: {},
    aborted: false,
    preview: !!opts.preview,
  };
  return ctx;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("数学家：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("同种子下假数字完全一致，且 ≠ 真实值", () => {
    const a = pickFakeAbnormalCount(3, createDeterministicRandom(seedFor(0, 2)));
    const b = pickFakeAbnormalCount(3, createDeterministicRandom(seedFor(0, 2)));
    expect(b).toBe(a);
    expect(a).not.toBe(3);
  });

  it("不同夜次的种子会重新随机", () => {
    const values = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickFakeAbnormalCount(3, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(values.size).toBeGreaterThan(1);
  });

  it("未受干扰时如实告知异常次数", async () => {
    const executed = await runFullAbilityPipeline(
      pipe(mathematicianAbility),
      makeCtx()
    );
    expect((executed.meta.abilityResult as any)?.abnormalCount).toBe(3);
  });

  it("中毒时：预览（只跑 calculate）与完整执行得出同一个数字", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(mathematicianAbility),
      makeCtx({ preview: true, poisoned: true })
    );
    const executed = await runFullAbilityPipeline(
      pipe(mathematicianAbility),
      makeCtx({ poisoned: true })
    );

    const previewCount = (preview.meta.abilityResult as any)?.abnormalCount;
    expect((executed.meta.abilityResult as any)?.abnormalCount).toBe(previewCount);
    expect(previewCount).not.toBe(3);
    expect((executed.meta.abilityResult as any)?.actualCount).toBe(3);
  });
});
