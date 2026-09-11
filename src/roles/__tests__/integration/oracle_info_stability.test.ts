import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  oracleAbility,
  pickFakeDeadEvilCount,
} from "../../new_engine/oracle.ability";

// 神谕者：每夜得知「已死亡玩家中有几名邪恶」。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("oracle", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  oracle: "神谕者",
  empath: "共情者",
  chef: "厨师",
  baron: "男爵",
  imp: "小恶魔",
};

function seat(
  id: number,
  roleId: string,
  type: string,
  opts: { dead?: boolean; poisoned?: boolean } = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!opts.dead,
    isAlive: !opts.dead,
    isDrunk: false,
    isPoisoned: !!opts.poisoned,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: opts.poisoned ? [{ type: "poisoned" }] : [],
  };
}

/** 最小座位集：神谕者 + 1 名死亡的邪恶 + 1 名死亡的镇民 + 2 名存活玩家 */
function makeSeats(poisonedSelf = false) {
  return [
    seat(0, "oracle", "townsfolk", { poisoned: poisonedSelf }),
    seat(1, "empath", "townsfolk", { dead: true }),
    seat(2, "imp", "demon", { dead: true }),
    seat(3, "baron", "minion"),
    seat(4, "chef", "townsfolk"),
  ];
}

function makeCtx(opts: { preview?: boolean; poisoned?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 3,
      gamePhase: "night",
      seats: makeSeats(!!opts.poisoned),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "oracle",
      roleName: "神谕者",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "oracle_nightly_ability",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: 98,
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

describe("神谕者：提示预演与实际执行必须给出同一个数字（回归）", () => {
  it("同种子下假数字完全一致，且 ≠ 真实死亡邪恶数", () => {
    const a = pickFakeDeadEvilCount(1, 5, createDeterministicRandom(seedFor(0, 3)));
    const b = pickFakeDeadEvilCount(1, 5, createDeterministicRandom(seedFor(0, 3)));
    expect(b).toBe(a);
    expect(a).not.toBe(1);
  });

  it("不同夜次的种子会重新随机", () => {
    const values = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        pickFakeDeadEvilCount(1, 5, createDeterministicRandom(seedFor(0, n)))
      )
    );
    expect(values.size).toBeGreaterThan(1);
  });

  it("未受干扰时如实告知死亡邪恶人数", async () => {
    const executed = await runFullAbilityPipeline(pipe(oracleAbility), makeCtx());
    expect((executed.meta.abilityResult as any)?.deadEvilCount).toBe(1);
    expect((executed.meta.abilityResult as any)?.finalCount).toBe(1);
  });

  it("中毒时：预览（只跑 calculate）与完整执行得出同一个数字", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(oracleAbility),
      makeCtx({ preview: true, poisoned: true })
    );
    const executed = await runFullAbilityPipeline(
      pipe(oracleAbility),
      makeCtx({ poisoned: true })
    );

    const previewCount = (preview.meta.abilityResult as any)?.finalCount;
    expect((executed.meta.abilityResult as any)?.finalCount).toBe(previewCount);
    expect(previewCount).not.toBe(1);
  });
});
