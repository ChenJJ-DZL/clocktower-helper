import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickPriestessTarget,
  priestessAbility,
} from "../../new_engine/priestess.ability";

// 女祭司：每夜得知一名「最值得交流」的玩家。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("priestess", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  priestess: "女祭司",
  empath: "共情者",
  chef: "厨师",
  baron: "男爵",
  imp: "小恶魔",
};

function seat(id: number, roleId: string, type: string, dead = false) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: dead,
    isAlive: !dead,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: [],
  };
}

/** 最小座位集：女祭司 + 3 名其他玩家（含一名死亡玩家，女祭司可以指向死者） */
function makeSeats() {
  return [
    seat(0, "priestess", "townsfolk"),
    seat(1, "empath", "townsfolk"),
    seat(2, "chef", "townsfolk", true),
    seat(3, "baron", "minion"),
  ];
}

function makeCtx(opts: { preview?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      seats: makeSeats(),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "priestess",
      roleName: "女祭司",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "priestess_nightly_ability",
      wakeMessage: "",
      firstNightPriority: 19,
      otherNightPriority: 19,
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

describe("女祭司：提示预演与实际执行必须指向同一名玩家（回归）", () => {
  it("同种子下选中的玩家完全一致", () => {
    const candidates = makeSeats().filter((s) => s.id !== 0);
    const a = pickPriestessTarget(candidates, createDeterministicRandom(seedFor(0, 2)));
    const b = pickPriestessTarget(candidates, createDeterministicRandom(seedFor(0, 2)));
    expect(b?.id).toBe(a?.id);
    expect([1, 2, 3]).toContain(a?.id);
  });

  it("不同夜次的种子会重新随机", () => {
    const candidates = makeSeats().filter((s) => s.id !== 0);
    const ids = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) =>
          pickPriestessTarget(candidates, createDeterministicRandom(seedFor(0, n)))?.id
      )
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("预览（只跑 calculate）与完整执行指向同一名玩家", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(priestessAbility),
      makeCtx({ preview: true })
    );
    const executed = await runFullAbilityPipeline(
      pipe(priestessAbility),
      makeCtx()
    );

    expect(executed.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect((executed.meta.priestessResult as any)?.targetId).toBe(
      (preview.meta.abilityResult as any)?.targetId
    );
  });
});
