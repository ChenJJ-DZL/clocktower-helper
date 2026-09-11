import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  jugglerAbility,
  pickFakeCorrectCount,
} from "../../new_engine/juggler.ability";

// 杂耍艺人：白天能力。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("juggler", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  juggler: "杂耍艺人",
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
      nightCount: 1,
      dayCount: 1,
      gamePhase: "day",
      // 真实猜对数 = 1（由说书人预先记录）
      jugglerCorrectCount: 1,
      seats: [
        seat(0, "juggler", "townsfolk", !!opts.poisoned),
        seat(1, "empath", "townsfolk"),
        seat(2, "chef", "townsfolk"),
        seat(3, "imp", "demon"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "juggler",
      roleName: "杂耍艺人",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "juggler_guess",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: 100,
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

describe("杂耍艺人：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("同一夜、同一座位的种子给出完全相同的假数字", () => {
    const a = pickFakeCorrectCount(1, createDeterministicRandom(seedFor(0, 1)));
    const b = pickFakeCorrectCount(1, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toBe(a);
    // 假数字必须 ≠ 真实数字
    expect(a).not.toBe(1);
  });

  it("不同夜次的种子会重新随机", () => {
    const values = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickFakeCorrectCount(1, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(values.size).toBeGreaterThan(1);
  });

  it("中毒时：预览（只跑 calculate）与完整执行得出同一个告知数字", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(jugglerAbility),
      makeCtx({ preview: true, poisoned: true })
    );
    const executed = await runFullAbilityPipeline(
      pipe(jugglerAbility),
      makeCtx({ poisoned: true })
    );

    const previewCount = (preview.meta.abilityResult as any)?.correctCount;
    const executedCount = (executed.meta.abilityResult as any)?.correctCount;

    expect(executedCount).toBe(previewCount);
    // 确实走上了「捏造假数字」的分支
    expect(executedCount).not.toBe(1);
    expect((executed.meta.abilityResult as any)?.realCount).toBe(1);
  });
});
