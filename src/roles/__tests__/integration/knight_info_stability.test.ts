import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeInfo,
  generateRealInfo,
  knightAbility,
} from "../../new_engine/knight.ability";

// 骑士：首夜信息。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("knight", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  knight: "骑士",
  empath: "共情者",
  chef: "厨师",
  saint: "圣徒",
  baron: "男爵",
  imp: "小恶魔",
};

function seat(id: number, roleId: string, type: string) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: [] as Array<{ type: string }>,
  };
}

/** 最小座位集：骑士自己 + 4 名非恶魔 + 1 名恶魔 */
function makeSeats() {
  return [
    seat(0, "knight", "townsfolk"),
    seat(1, "empath", "townsfolk"),
    seat(2, "chef", "townsfolk"),
    seat(3, "saint", "outsider"),
    seat(4, "baron", "minion"),
    seat(5, "imp", "demon"),
  ];
}

function makeCtx(opts: { preview?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: makeSeats(),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "knight",
      roleName: "骑士",
      priority: 0,
      isFirstNightOnly: true,
      abilityId: "knight_first_night_ability",
      wakeMessage: "",
      firstNightPriority: 65,
      otherNightPriority: null,
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

describe("骑士：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("真实信息在同种子下完全一致", () => {
    const a = generateRealInfo(makeSeats(), 0, createDeterministicRandom(seedFor(0, 1)));
    const b = generateRealInfo(makeSeats(), 0, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toEqual(a);
    expect(a.seat1).not.toBe(0);
    expect(a.seat2).not.toBe(0);
    expect(a.seat1).not.toBe(a.seat2);
  });

  it("假信息（含恶魔）在同种子下完全一致", () => {
    const a = generateFakeInfo(makeSeats(), 0, createDeterministicRandom(seedFor(0, 1)));
    const b = generateFakeInfo(makeSeats(), 0, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toEqual(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一组玩家）", () => {
    const pairs = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        JSON.stringify(generateRealInfo(makeSeats(), 0, createDeterministicRandom(seedFor(0, n))))
      )
    );
    expect(pairs.size).toBeGreaterThan(1);
  });

  it("预览（只跑 calculate）与完整执行得出同一组玩家", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(knightAbility),
      makeCtx({ preview: true })
    );
    const executed = await runFullAbilityPipeline(pipe(knightAbility), makeCtx());

    expect(executed.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect((executed.meta.knightResult as any)?.seat1).toBe(
      (preview.meta.abilityResult as any)?.seat1
    );
    expect((executed.meta.knightResult as any)?.seat2).toBe(
      (preview.meta.abilityResult as any)?.seat2
    );
  });
});
